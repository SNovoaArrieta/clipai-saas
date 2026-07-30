import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { PrismaAttestationRepository } from '../../src/attestations/prisma-attestation-repository.js';
import { DefaultAttestationService } from '../../src/attestations/attestation-service.js';
import type { DatabaseClient } from '../../src/database/database-client.js';
import { createPrismaDatabaseClient } from '../../src/database/prisma-database-client.js';
import type { IdentityVerifier } from '../../src/identity/identity-verifier.js';
import { PrismaProjectService } from '../../src/projects/prisma-project-service.js';
import { PrismaIdentityProvisioner } from '../../src/provisioning/prisma-identity-provisioner.js';

const configuredTestDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase =
  configuredTestDatabaseUrl !== undefined && configuredTestDatabaseUrl !== '';

function requireSafeTestDatabaseUrl(): string {
  if (!hasTestDatabase || configuredTestDatabaseUrl === undefined) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('PostgreSQL tests require NODE_ENV=test.');
  }
  let url: URL;
  try {
    url = new URL(configuredTestDatabaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !databaseName.toLowerCase().includes('test')
  ) {
    throw new Error(
      'PostgreSQL tests require a database name containing "test".',
    );
  }
  return configuredTestDatabaseUrl;
}

const describeWithPostgres = hasTestDatabase ? describe : describe.skip;

describeWithPostgres('HTTP PostgreSQL OwnershipAttestation foundation', () => {
  let databaseClient: DatabaseClient;
  let identityProvisioner: PrismaIdentityProvisioner;
  let projectService: PrismaProjectService;
  let attestationService: DefaultAttestationService;
  const trackedAuthSubjects = new Set<string>();

  const identityVerifier: IdentityVerifier = {
    verifyAccessToken: async (token) => ({ authSubject: token }),
  };

  async function createPrincipal() {
    const authSubject = randomUUID();
    trackedAuthSubjects.add(authSubject);
    const principal = await identityProvisioner.provision({ authSubject });
    return { authSubject, principal };
  }

  function createProject(workspaceId: string, title = 'Attestation project') {
    return projectService.createProject({
      workspaceId,
      title,
      idempotencyKey: `project:${randomUUID()}`,
    });
  }

  async function createSource(
    workspaceId: string,
    projectId: string,
    options: {
      state?: 'submitted' | 'validating' | 'accepted' | 'rejected';
      archivedAt?: Date | null;
      completed?: boolean;
    } = {},
  ) {
    const sourceId = randomUUID();
    const uploadId = randomUUID();
    await databaseClient.prisma.$transaction(async (transaction) => {
      await transaction.source.create({
        data: {
          id: sourceId,
          workspaceId,
          projectId,
          safeReference: `source-${sourceId}.mp4`,
          state: options.state ?? 'validating',
          ...(options.archivedAt === undefined
            ? {}
            : { archivedAt: options.archivedAt }),
        },
      });
      await transaction.uploadIntent.create({
        data: {
          id: uploadId,
          workspaceId,
          projectId,
          sourceId,
          objectKey: `uploads/${uploadId}/${randomUUID()}.mp4`,
          declaredContentType: 'video/mp4',
          declaredSizeBytes: 1024n,
          originalFilename: 'synthetic.mp4',
          expiresAt: new Date(Date.now() + 60_000),
          observedSizeBytes: options.completed === false ? null : 1024n,
          observedContentType: options.completed === false ? null : 'video/mp4',
          storageRevision:
            options.completed === false ? null : `revision-${randomUUID()}`,
          completedAt: options.completed === false ? null : new Date(),
          createIdempotencyKey: `upload:${randomUUID()}`,
        },
      });
    });
    return { sourceId, uploadId };
  }

  function postAttestation(
    authSubject: string,
    projectId: string,
    sourceId: string,
    options: {
      key?: string;
      authorizationBasis?: 'owner' | 'authorized_by_owner';
    } = {},
  ) {
    const app = createApp({
      identityVerifier,
      identityProvisioner,
      attestationService,
    });
    return request(app)
      .post(`/api/v1/projects/${projectId}/sources/${sourceId}/attestations`)
      .set('Authorization', `Bearer ${authSubject}`)
      .set('Idempotency-Key', options.key ?? `attestation:${randomUUID()}`)
      .send({
        accepted: true,
        statementVersion: 'ownership-v1',
        authorizationBasis: options.authorizationBasis ?? 'owner',
      });
  }

  async function createFixture() {
    const actor = await createPrincipal();
    const project = await createProject(actor.principal.workspace.id);
    const source = await createSource(
      actor.principal.workspace.id,
      project.project.id,
    );
    return { actor, project, source };
  }

  beforeAll(() => {
    databaseClient = createPrismaDatabaseClient(requireSafeTestDatabaseUrl());
    identityProvisioner = new PrismaIdentityProvisioner(databaseClient.prisma);
    projectService = new PrismaProjectService(databaseClient.prisma);
    attestationService = new DefaultAttestationService(
      new PrismaAttestationRepository(databaseClient.prisma),
    );
  });

  afterEach(async () => {
    const authSubjects = [...trackedAuthSubjects];
    const workspaces = await databaseClient.prisma.workspace.findMany({
      where: { owner: { authSubject: { in: authSubjects } } },
      select: { id: true },
    });
    const workspaceIds = workspaces.map(({ id }) => id);
    await databaseClient.prisma.ownershipAttestation.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await databaseClient.prisma.uploadIntent.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await databaseClient.prisma.source.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await databaseClient.prisma.project.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await databaseClient.prisma.workspace.deleteMany({
      where: { id: { in: workspaceIds } },
    });
    await databaseClient.prisma.user.deleteMany({
      where: { authSubject: { in: authSubjects } },
    });
    trackedAuthSubjects.clear();
  });

  afterAll(async () => {
    await databaseClient?.close();
  });

  it('durably records the authenticated actor and tenant-safe Source without changing domain state', async () => {
    const { actor, project, source } = await createFixture();
    const projectBefore = await databaseClient.prisma.project.findUniqueOrThrow(
      {
        where: { id: project.project.id },
      },
    );
    const response = await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
      { authorizationBasis: 'authorized_by_owner' },
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      id: expect.any(String),
      sourceId: source.sourceId,
      statementVersion: 'ownership-v1',
      authorizationBasis: 'authorized_by_owner',
      attestedAt: expect.any(String),
    });
    const stored =
      await databaseClient.prisma.ownershipAttestation.findUniqueOrThrow({
        where: { id: response.body.data.id as string },
      });
    expect(stored.workspaceId).toBe(actor.principal.workspace.id);
    expect(stored.projectId).toBe(project.project.id);
    expect(stored.sourceId).toBe(source.sourceId);
    expect(stored.userId).toBe(actor.principal.user.id);
    expect(stored.authorizationBasis).toBe('authorized_by_owner');
    expect(stored.statementVersion).toBe('ownership-v1');
    const sourceAfter = await databaseClient.prisma.source.findUniqueOrThrow({
      where: { id: source.sourceId },
    });
    expect(sourceAfter.state).toBe('validating');
    expect(sourceAfter.isActive).toBe(false);
    await expect(
      databaseClient.prisma.project.findUniqueOrThrow({
        where: { id: project.project.id },
      }),
    ).resolves.toEqual(projectBefore);
  });

  it('makes nonexistent and cross-workspace Projects publicly indistinguishable', async () => {
    const first = await createPrincipal();
    const second = await createPrincipal();
    const hiddenProject = await createProject(second.principal.workspace.id);
    const hiddenSource = await createSource(
      second.principal.workspace.id,
      hiddenProject.project.id,
    );

    for (const candidate of [randomUUID(), hiddenProject.project.id]) {
      const response = await postAttestation(
        first.authSubject,
        candidate,
        hiddenSource.sourceId,
      );
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project was not found.',
        },
      });
    }
  });

  it.each(['nonexistent', 'cross-workspace', 'other-project'] as const)(
    'hides a %s Source',
    async (scenario) => {
      const first = await createPrincipal();
      const project = await createProject(first.principal.workspace.id);
      let candidateSourceId = randomUUID();
      if (scenario === 'cross-workspace') {
        const second = await createPrincipal();
        const hiddenProject = await createProject(
          second.principal.workspace.id,
        );
        candidateSourceId = (
          await createSource(
            second.principal.workspace.id,
            hiddenProject.project.id,
          )
        ).sourceId;
      }
      if (scenario === 'other-project') {
        const otherProject = await createProject(first.principal.workspace.id);
        candidateSourceId = (
          await createSource(
            first.principal.workspace.id,
            otherProject.project.id,
          )
        ).sourceId;
      }

      const response = await postAttestation(
        first.authSubject,
        project.project.id,
        candidateSourceId,
      );
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('SOURCE_NOT_FOUND');
    },
  );

  it('treats an archived Source as invisible', async () => {
    const actor = await createPrincipal();
    const project = await createProject(actor.principal.workspace.id);
    const source = await createSource(
      actor.principal.workspace.id,
      project.project.id,
      { archivedAt: new Date() },
    );
    const response = await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
    );
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SOURCE_NOT_FOUND');
  });

  it('preserves PROJECT_ARCHIVED for an archived Project', async () => {
    const { actor, project, source } = await createFixture();
    await databaseClient.prisma.project.update({
      where: { id: project.project.id },
      data: { state: 'archived', archivedAt: new Date() },
    });
    const response = await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
    );
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PROJECT_ARCHIVED');
  });

  it.each(['submitted', 'accepted', 'rejected'] as const)(
    'blocks Source state %s',
    async (state) => {
      const actor = await createPrincipal();
      const project = await createProject(actor.principal.workspace.id);
      const source = await createSource(
        actor.principal.workspace.id,
        project.project.id,
        { state },
      );
      const response = await postAttestation(
        actor.authSubject,
        project.project.id,
        source.sourceId,
      );
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SOURCE_NOT_READY_FOR_ATTESTATION');
    },
  );

  it('blocks a validating Source without a completed upload', async () => {
    const actor = await createPrincipal();
    const project = await createProject(actor.principal.workspace.id);
    const source = await createSource(
      actor.principal.workspace.id,
      project.project.id,
      { completed: false },
    );
    const response = await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
    );
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SOURCE_NOT_READY_FOR_ATTESTATION');
  });

  it('replays the same request without changing identity or attestedAt', async () => {
    const { actor, project, source } = await createFixture();
    const key = `attestation:${randomUUID()}`;
    const first = await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
      { key },
    );
    const replay = await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
      { key },
    );

    expect(replay.status).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.data).toEqual(first.body.data);
    await expect(
      databaseClient.prisma.ownershipAttestation.count({
        where: { sourceId: source.sourceId },
      }),
    ).resolves.toBe(1);
  });

  it.each(['accepted', 'rejected'] as const)(
    'replays the original attestation after Source becomes %s',
    async (state) => {
      const { actor, project, source } = await createFixture();
      const key = `attestation:${randomUUID()}`;
      const first = await postAttestation(
        actor.authSubject,
        project.project.id,
        source.sourceId,
        { key },
      );
      expect(first.status).toBe(201);

      await databaseClient.prisma.source.update({
        where: { id: source.sourceId },
        data: { state },
      });

      const replay = await postAttestation(
        actor.authSubject,
        project.project.id,
        source.sourceId,
        { key },
      );
      expect(replay.status).toBe(201);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(replay.body.data).toEqual(first.body.data);
      await expect(
        databaseClient.prisma.ownershipAttestation.count({
          where: { sourceId: source.sourceId },
        }),
      ).resolves.toBe(1);
    },
  );

  it.each(['accepted', 'rejected'] as const)(
    'does not allow a new attestation after Source becomes %s',
    async (state) => {
      const { actor, project, source } = await createFixture();
      const first = await postAttestation(
        actor.authSubject,
        project.project.id,
        source.sourceId,
      );
      expect(first.status).toBe(201);

      await databaseClient.prisma.source.update({
        where: { id: source.sourceId },
        data: { state },
      });

      const newRequest = await postAttestation(
        actor.authSubject,
        project.project.id,
        source.sourceId,
      );
      expect(newRequest.status).toBe(409);
      expect(newRequest.body.error.code).toBe(
        'SOURCE_NOT_READY_FOR_ATTESTATION',
      );
      await expect(
        databaseClient.prisma.ownershipAttestation.count({
          where: { sourceId: source.sourceId },
        }),
      ).resolves.toBe(1);
    },
  );

  it('replays concurrent equivalent requests after Source becomes accepted', async () => {
    const { actor, project, source } = await createFixture();
    const key = `attestation:${randomUUID()}`;
    const first = await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
      { key },
    );
    expect(first.status).toBe(201);
    await databaseClient.prisma.source.update({
      where: { id: source.sourceId },
      data: { state: 'accepted' },
    });

    const replays = await Promise.all(
      Array.from({ length: 8 }, () =>
        postAttestation(
          actor.authSubject,
          project.project.id,
          source.sourceId,
          { key },
        ),
      ),
    );

    expect(replays.every(({ status }) => status === 201)).toBe(true);
    expect(
      replays.every(
        ({ body, headers }) =>
          headers['idempotency-replayed'] === 'true' &&
          body.data.id === first.body.data.id,
      ),
    ).toBe(true);
    await expect(
      databaseClient.prisma.ownershipAttestation.count({
        where: { sourceId: source.sourceId },
      }),
    ).resolves.toBe(1);
  });

  it.each([
    'different-basis',
    'different-source',
    'different-project',
  ] as const)(
    'returns an idempotency conflict for %s with the same key',
    async (scenario) => {
      const { actor, project, source } = await createFixture();
      const key = `attestation:${randomUUID()}`;
      await postAttestation(
        actor.authSubject,
        project.project.id,
        source.sourceId,
        { key },
      );
      let targetProjectId = project.project.id;
      let targetSourceId = source.sourceId;
      let authorizationBasis: 'owner' | 'authorized_by_owner' =
        'authorized_by_owner';
      if (scenario === 'different-source') {
        targetSourceId = (
          await createSource(actor.principal.workspace.id, project.project.id)
        ).sourceId;
        authorizationBasis = 'owner';
      }
      if (scenario === 'different-project') {
        const otherProject = await createProject(actor.principal.workspace.id);
        targetProjectId = otherProject.project.id;
        targetSourceId = (
          await createSource(
            actor.principal.workspace.id,
            otherProject.project.id,
          )
        ).sourceId;
        authorizationBasis = 'owner';
      }
      const conflict = await postAttestation(
        actor.authSubject,
        targetProjectId,
        targetSourceId,
        { key, authorizationBasis },
      );
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    },
  );

  it('rejects a semantic duplicate using another key', async () => {
    const { actor, project, source } = await createFixture();
    await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
    );
    const duplicate = await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ATTESTATION_ALREADY_EXISTS');
    await expect(
      databaseClient.prisma.ownershipAttestation.count({
        where: { sourceId: source.sourceId },
      }),
    ).resolves.toBe(1);
  });

  it('serializes concurrent equivalent requests to one durable row', async () => {
    const { actor, project, source } = await createFixture();
    const key = `attestation:${randomUUID()}`;
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        postAttestation(
          actor.authSubject,
          project.project.id,
          source.sourceId,
          { key },
        ),
      ),
    );
    expect(responses.every(({ status }) => status === 201)).toBe(true);
    expect(new Set(responses.map(({ body }) => body.data.id)).size).toBe(1);
    await expect(
      databaseClient.prisma.ownershipAttestation.count({
        where: { sourceId: source.sourceId },
      }),
    ).resolves.toBe(1);
  });

  it('allows at most one concurrent semantic declaration with different keys', async () => {
    const { actor, project, source } = await createFixture();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        postAttestation(actor.authSubject, project.project.id, source.sourceId),
      ),
    );
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(
      responses.filter(
        ({ body }) => body.error?.code === 'ATTESTATION_ALREADY_EXISTS',
      ),
    ).toHaveLength(7);
    await expect(
      databaseClient.prisma.ownershipAttestation.count({
        where: { sourceId: source.sourceId },
      }),
    ).resolves.toBe(1);
  });

  it('rechecks Source visibility after a concurrent archive wins the row lock', async () => {
    const { actor, project, source } = await createFixture();
    let requestCompleted = false;
    let pendingRequest:
      | Promise<Awaited<ReturnType<typeof postAttestation>>>
      | undefined;

    await databaseClient.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id"
        FROM "Source"
        WHERE "id" = ${source.sourceId}::uuid
        FOR UPDATE
      `;
      pendingRequest = postAttestation(
        actor.authSubject,
        project.project.id,
        source.sourceId,
      ).then((response) => {
        requestCompleted = true;
        return response;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(requestCompleted).toBe(false);
      await transaction.source.update({
        where: { id: source.sourceId },
        data: { archivedAt: new Date() },
      });
    });

    if (pendingRequest === undefined) {
      expect.fail('Expected a concurrent attestation request.');
    }
    const response = await pendingRequest;
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SOURCE_NOT_FOUND');
    await expect(
      databaseClient.prisma.ownershipAttestation.count({
        where: { sourceId: source.sourceId },
      }),
    ).resolves.toBe(0);
  });

  it('rejects direct cross-tenant Source associations through foreign keys', async () => {
    const first = await createPrincipal();
    const second = await createPrincipal();
    const firstProject = await createProject(first.principal.workspace.id);
    const secondProject = await createProject(second.principal.workspace.id);
    const firstSource = await createSource(
      first.principal.workspace.id,
      firstProject.project.id,
    );
    await expectForeignKeyViolation(
      databaseClient.prisma.ownershipAttestation.create({
        data: {
          workspaceId: second.principal.workspace.id,
          projectId: secondProject.project.id,
          sourceId: firstSource.sourceId,
          userId: second.principal.user.id,
          statementVersion: 'ownership-v1',
          authorizationBasis: 'owner',
          createIdempotencyKey: `attestation:${randomUUID()}`,
        },
      }),
    );
  });

  it('rejects a direct actor from another workspace', async () => {
    const { actor, project, source } = await createFixture();
    const other = await createPrincipal();
    await expectForeignKeyViolation(
      databaseClient.prisma.ownershipAttestation.create({
        data: {
          workspaceId: actor.principal.workspace.id,
          projectId: project.project.id,
          sourceId: source.sourceId,
          userId: other.principal.user.id,
          statementVersion: 'ownership-v1',
          authorizationBasis: 'owner',
          createIdempotencyKey: `attestation:${randomUUID()}`,
        },
      }),
    );
  });

  it('restricts Source deletion while evidence exists', async () => {
    const { actor, project, source } = await createFixture();
    await postAttestation(
      actor.authSubject,
      project.project.id,
      source.sourceId,
    );
    await databaseClient.prisma.uploadIntent.delete({
      where: { sourceId: source.sourceId },
    });
    await expectForeignKeyViolation(
      databaseClient.prisma.source.delete({
        where: { id: source.sourceId },
      }),
    );
  });
});

async function expectForeignKeyViolation(operation: Promise<unknown>) {
  let rejection: unknown;
  try {
    await operation;
  } catch (error: unknown) {
    rejection = error;
  }
  if (typeof rejection !== 'object' || rejection === null) {
    expect.fail('Expected a PostgreSQL foreign key violation.');
  }
  const error = rejection as {
    readonly code?: unknown;
    readonly cause?: { readonly code?: unknown };
  };
  expect(
    error.code === 'P2003' ||
      error.cause?.code === '23503' ||
      error.cause?.code === '23001',
  ).toBe(true);
}
