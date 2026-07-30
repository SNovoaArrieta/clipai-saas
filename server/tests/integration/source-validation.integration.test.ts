import { randomUUID } from 'node:crypto';

import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { createApp } from '../../src/app.js';
import type { DatabaseClient } from '../../src/database/database-client.js';
import { createPrismaDatabaseClient } from '../../src/database/prisma-database-client.js';
import type { IdentityVerifier } from '../../src/identity/identity-verifier.js';
import type { MediaInspector } from '../../src/media/media-inspector.js';
import { PrismaProjectService } from '../../src/projects/prisma-project-service.js';
import { PrismaIdentityProvisioner } from '../../src/provisioning/prisma-identity-provisioner.js';
import {
  ObjectStorageNotFoundError,
  type ObjectStorage,
} from '../../src/storage/object-storage.js';
import { PrismaSourceValidationRepository } from '../../src/sources/prisma-source-validation-repository.js';
import { DefaultSourceValidationService } from '../../src/sources/source-validation-service.js';

const configuredTestDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase =
  configuredTestDatabaseUrl !== undefined && configuredTestDatabaseUrl !== '';
const constraintName = 'UploadIntent_completed_requires_storage_revision';

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

describeWithPostgres('HTTP PostgreSQL Source media validation', () => {
  let databaseClient: DatabaseClient;
  let identityProvisioner: PrismaIdentityProvisioner;
  let projectService: PrismaProjectService;
  let validationService: DefaultSourceValidationService;
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

  async function createFixture(options: { withUpload?: boolean } = {}) {
    const actor = await createPrincipal();
    const project = await projectService.createProject({
      workspaceId: actor.principal.workspace.id,
      title: 'Source validation project',
      idempotencyKey: `project:${randomUUID()}`,
    });
    const sourceId = randomUUID();
    const uploadId = randomUUID();
    const storageRevision = `revision-${randomUUID()}`;
    const objectBytes = new Uint8Array([0, 1, 2, 3]);

    await databaseClient.prisma.$transaction(async (transaction) => {
      await transaction.source.create({
        data: {
          id: sourceId,
          workspaceId: actor.principal.workspace.id,
          projectId: project.project.id,
          safeReference: `source-${sourceId}.mp4`,
          state: 'validating',
        },
      });
      if (options.withUpload !== false) {
        await transaction.uploadIntent.create({
          data: {
            id: uploadId,
            workspaceId: actor.principal.workspace.id,
            projectId: project.project.id,
            sourceId,
            objectKey: `uploads/${uploadId}/${randomUUID()}.mp4`,
            declaredContentType: 'video/mp4',
            declaredSizeBytes: BigInt(objectBytes.byteLength),
            originalFilename: 'synthetic.mp4',
            expiresAt: new Date(Date.now() + 60_000),
            observedSizeBytes: BigInt(objectBytes.byteLength),
            observedContentType: 'video/mp4',
            storageRevision,
            completedAt: new Date(),
            createIdempotencyKey: `upload:${randomUUID()}`,
          },
        });
      }
      await transaction.ownershipAttestation.create({
        data: {
          workspaceId: actor.principal.workspace.id,
          projectId: project.project.id,
          sourceId,
          userId: actor.principal.user.id,
          statementVersion: 'ownership-v1',
          authorizationBasis: 'owner',
          createIdempotencyKey: `attestation:${randomUUID()}`,
        },
      });
    });

    return {
      actor,
      projectId: project.project.id,
      sourceId,
      uploadId,
      storageRevision,
      objectBytes,
    };
  }

  function acceptingInspector(): MediaInspector {
    return {
      inspect: vi.fn(async () => ({
        outcome: 'accepted' as const,
        container: 'mp4' as const,
        contentType: 'video/mp4' as const,
        durationMs: 2_500,
        hasAudio: true,
        hasVideo: true,
      })),
    };
  }

  function localStorage(
    bytes: Uint8Array,
    override: Partial<ObjectStorage> = {},
  ): ObjectStorage {
    return {
      createUploadTarget: vi.fn(async () => {
        throw new Error('Unexpected upload target creation.');
      }),
      inspectUploadedObject: vi.fn(async () => {
        throw new Error('Unexpected HEAD inspection.');
      }),
      readConfirmedObject: vi.fn(async () => ({
        sizeBytes: bytes.byteLength,
        body: (async function* () {
          yield bytes;
        })(),
      })),
      ...override,
    };
  }

  function validate(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    objectStorage: ObjectStorage,
    mediaInspector: MediaInspector,
  ) {
    const app = createApp({
      identityVerifier,
      identityProvisioner,
      sourceValidationService: validationService,
      objectStorage,
      mediaInspector,
    });
    return request(app)
      .post(
        `/api/v1/projects/${fixture.projectId}/sources/${fixture.sourceId}/validate`,
      )
      .set('Authorization', `Bearer ${fixture.actor.authSubject}`);
  }

  beforeAll(() => {
    databaseClient = createPrismaDatabaseClient(requireSafeTestDatabaseUrl());
    identityProvisioner = new PrismaIdentityProvisioner(databaseClient.prisma);
    projectService = new PrismaProjectService(databaseClient.prisma);
    validationService = new DefaultSourceValidationService(
      new PrismaSourceValidationRepository(databaseClient.prisma),
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

  it('keeps the revision constraint NOT VALID while rejecting a new completed upload without a revision', async () => {
    const fixture = await createFixture({ withUpload: false });
    const constraint = await databaseClient.prisma.$queryRaw<
      { readonly convalidated: boolean }[]
    >`
      SELECT "convalidated"
      FROM "pg_constraint"
      WHERE "conname" = ${constraintName}
    `;

    expect(constraint).toEqual([{ convalidated: false }]);

    const operation = databaseClient.prisma.uploadIntent.create({
      data: {
        id: fixture.uploadId,
        workspaceId: fixture.actor.principal.workspace.id,
        projectId: fixture.projectId,
        sourceId: fixture.sourceId,
        objectKey: `uploads/${fixture.uploadId}/${randomUUID()}.mp4`,
        declaredContentType: 'video/mp4',
        declaredSizeBytes: 4n,
        originalFilename: 'invalid-completed.mp4',
        expiresAt: new Date(Date.now() + 60_000),
        observedSizeBytes: 4n,
        observedContentType: 'video/mp4',
        storageRevision: null,
        completedAt: new Date(),
        createIdempotencyKey: `upload:${randomUUID()}`,
      },
    });

    await expectCheckViolation(operation, constraintName);
    await expect(
      databaseClient.prisma.uploadIntent.findUnique({
        where: { id: fixture.uploadId },
      }),
    ).resolves.toBeNull();
  });

  it('tolerates a legacy completed row without a revision and leaves its Source validating', async () => {
    const fixture = await createFixture();

    await databaseClient.prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `ALTER TABLE "UploadIntent" DROP CONSTRAINT "${constraintName}"`,
      );
      await transaction.uploadIntent.update({
        where: { id: fixture.uploadId },
        data: { storageRevision: null },
      });
      await transaction.$executeRawUnsafe(
        `ALTER TABLE "UploadIntent" ADD CONSTRAINT "${constraintName}" CHECK ("completedAt" IS NULL OR "storageRevision" IS NOT NULL) NOT VALID`,
      );
    });

    const storage = localStorage(fixture.objectBytes);
    const inspector = acceptingInspector();
    const response = await validate(fixture, storage, inspector);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('STORAGE_REVISION_UNAVAILABLE');
    expect(storage.readConfirmedObject).not.toHaveBeenCalled();
    expect(inspector.inspect).not.toHaveBeenCalled();
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.sourceId },
        select: { state: true, durationMs: true, isActive: true },
      }),
    ).resolves.toEqual({
      state: 'validating',
      durationMs: null,
      isActive: false,
    });
  });

  it('runs concurrent revision reads outside row locks and resolves finalization through CAS replay', async () => {
    const fixture = await createFixture();
    let startedReads = 0;
    let resolveTwoReads: (() => void) | undefined;
    let releaseReads: (() => void) | undefined;
    const twoReads = new Promise<void>((resolve) => {
      resolveTwoReads = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const storage = localStorage(fixture.objectBytes, {
      readConfirmedObject: vi.fn(async () => {
        startedReads += 1;
        if (startedReads === 2) {
          resolveTwoReads?.();
        }
        await released;
        return {
          sizeBytes: fixture.objectBytes.byteLength,
          body: (async function* () {
            yield fixture.objectBytes;
          })(),
        };
      }),
    });
    const inspector = acceptingInspector();

    const responsesPromise = Promise.all([
      validate(fixture, storage, inspector),
      validate(fixture, storage, inspector),
    ]);
    let concurrencyTimeout: NodeJS.Timeout | undefined;
    const bothReachedIo = await Promise.race([
      twoReads.then(() => true),
      new Promise<false>((resolve) => {
        concurrencyTimeout = setTimeout(() => resolve(false), 1_000);
        concurrencyTimeout.unref();
      }),
    ]).finally(() => {
      if (concurrencyTimeout !== undefined) {
        clearTimeout(concurrencyTimeout);
      }
    });
    releaseReads?.();
    const responses = await responsesPromise;

    expect(bothReachedIo).toBe(true);
    expect(startedReads).toBe(2);
    expect(responses.every(({ status }) => status === 200)).toBe(true);
    expect(
      responses.filter(
        ({ headers }) => headers['source-validation-replayed'] === 'true',
      ),
    ).toHaveLength(1);
    expect(
      responses.map(({ body }) => ({
        id: body.data.id,
        state: body.data.state,
        durationMs: body.data.durationMs,
      })),
    ).toEqual([
      { id: fixture.sourceId, state: 'accepted', durationMs: 2_500 },
      { id: fixture.sourceId, state: 'accepted', durationMs: 2_500 },
    ]);
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.sourceId },
        select: { state: true, durationMs: true, isActive: true },
      }),
    ).resolves.toEqual({
      state: 'accepted',
      durationMs: 2_500n,
      isActive: false,
    });
  });

  it('keeps the Source validating when the confirmed storage revision disappears', async () => {
    const fixture = await createFixture();
    const inspector = acceptingInspector();
    const storage = localStorage(fixture.objectBytes, {
      readConfirmedObject: vi.fn(async () => {
        throw new ObjectStorageNotFoundError();
      }),
    });

    const response = await validate(fixture, storage, inspector);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('STORAGE_REVISION_UNAVAILABLE');
    expect(inspector.inspect).not.toHaveBeenCalled();
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.sourceId },
        select: { state: true, durationMs: true, isActive: true },
      }),
    ).resolves.toEqual({
      state: 'validating',
      durationMs: null,
      isActive: false,
    });
  });

  it('does not expose or validate a Source from another Workspace', async () => {
    const ownerFixture = await createFixture();
    const outsiderFixture = await createFixture();
    const storage = localStorage(ownerFixture.objectBytes);
    const inspector = acceptingInspector();
    const app = createApp({
      identityVerifier,
      identityProvisioner,
      sourceValidationService: validationService,
      objectStorage: storage,
      mediaInspector: inspector,
    });

    const response = await request(app)
      .post(
        `/api/v1/projects/${ownerFixture.projectId}/sources/${ownerFixture.sourceId}/validate`,
      )
      .set('Authorization', `Bearer ${outsiderFixture.actor.authSubject}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    expect(storage.readConfirmedObject).not.toHaveBeenCalled();
    expect(inspector.inspect).not.toHaveBeenCalled();
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: ownerFixture.sourceId },
        select: { state: true, durationMs: true, isActive: true },
      }),
    ).resolves.toEqual({
      state: 'validating',
      durationMs: null,
      isActive: false,
    });
  });
});

async function expectCheckViolation(
  operation: Promise<unknown>,
  expectedConstraint: string,
) {
  const rejection = await operation.catch((error: unknown) => error);
  if (typeof rejection !== 'object' || rejection === null) {
    expect.fail('Expected a PostgreSQL check constraint violation.');
  }
  const candidate = rejection as {
    readonly code?: unknown;
    readonly meta?: { readonly constraint?: unknown };
    readonly cause?: {
      readonly code?: unknown;
      readonly constraint?: unknown;
    };
  };
  expect(
    candidate.code === 'P2004' ||
      candidate.cause?.code === '23514' ||
      candidate.meta?.constraint === expectedConstraint ||
      candidate.cause?.constraint === expectedConstraint,
  ).toBe(true);
}
