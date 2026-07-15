import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { DatabaseClient } from '../../src/database/database-client.js';
import { createPrismaDatabaseClient } from '../../src/database/prisma-database-client.js';
import type { IdentityVerifier } from '../../src/identity/identity-verifier.js';
import { PrismaProjectService } from '../../src/projects/prisma-project-service.js';
import { PrismaIdentityProvisioner } from '../../src/provisioning/prisma-identity-provisioner.js';
import { decodeSourceCursor } from '../../src/sources/source-cursor.js';
import { PrismaSourceRepository } from '../../src/sources/prisma-source-repository.js';
import { DefaultSourceService } from '../../src/sources/source-service.js';

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

describeWithPostgres('HTTP PostgreSQL workspace-scoped Source listing', () => {
  let databaseClient: DatabaseClient;
  let identityProvisioner: PrismaIdentityProvisioner;
  let projectService: PrismaProjectService;
  let sourceService: DefaultSourceService;
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

  async function createProject(workspaceId: string, title = 'Source project') {
    return projectService.createProject({
      workspaceId,
      title,
      idempotencyKey: `project:${randomUUID()}`,
    });
  }

  async function createSource(
    workspaceId: string,
    projectId: string,
    overrides: Partial<{
      id: string;
      safeReference: string;
      state: 'submitted' | 'validating' | 'accepted' | 'rejected';
      isActive: boolean;
      durationMs: bigint | null;
      createdAt: Date;
      updatedAt: Date;
      archivedAt: Date | null;
    }> = {},
  ) {
    return databaseClient.prisma.source.create({
      data: {
        workspaceId,
        projectId,
        safeReference: `source-${randomUUID()}.mp4`,
        ...overrides,
      },
    });
  }

  function getSources(authSubject: string, projectId: string, suffix = '') {
    const app = createApp({
      identityVerifier,
      identityProvisioner,
      sourceService,
    });
    return request(app)
      .get(`/api/v1/projects/${projectId}/sources${suffix}`)
      .set('Authorization', `Bearer ${authSubject}`);
  }

  beforeAll(() => {
    databaseClient = createPrismaDatabaseClient(requireSafeTestDatabaseUrl());
    identityProvisioner = new PrismaIdentityProvisioner(databaseClient.prisma);
    projectService = new PrismaProjectService(databaseClient.prisma);
    sourceService = new DefaultSourceService(
      new PrismaSourceRepository(databaseClient.prisma),
    );
  });

  afterEach(async () => {
    const authSubjects = [...trackedAuthSubjects];
    const workspaces = await databaseClient.prisma.workspace.findMany({
      where: { owner: { authSubject: { in: authSubjects } } },
      select: { id: true },
    });
    const workspaceIds = workspaces.map(({ id }) => id);
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

  it('returns the same safe 404 for nonexistent and cross-workspace Projects', async () => {
    const first = await createPrincipal();
    const second = await createPrincipal();
    const hiddenProject = await createProject(second.principal.workspace.id);

    for (const id of [randomUUID(), hiddenProject.project.id]) {
      const response = await getSources(first.authSubject, id);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project was not found.',
        },
      });
    }
  });

  it('returns an empty page for a Project without Sources', async () => {
    const { authSubject, principal } = await createPrincipal();
    const project = await createProject(principal.workspace.id);
    const response = await getSources(authSubject, project.project.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      meta: { page: { limit: 20, nextCursor: null, hasMore: false } },
    });
  });

  it('lists one Source with only public fields and a safe BigInt duration', async () => {
    const { authSubject, principal } = await createPrincipal();
    const project = await createProject(principal.workspace.id);
    const source = await createSource(
      principal.workspace.id,
      project.project.id,
      {
        safeReference: 'private-safe-reference.mp4',
        state: 'validating',
        durationMs: 123_456n,
      },
    );
    const response = await getSources(authSubject, project.project.id);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        id: source.id,
        projectId: project.project.id,
        sourceType: 'upload',
        safeReference: 'private-safe-reference.mp4',
        state: 'validating',
        isActive: false,
        durationMs: 123_456,
        createdAt: source.createdAt.toISOString(),
        updatedAt: source.updatedAt.toISOString(),
      },
    ]);
    const serialized = JSON.stringify(response.body);
    for (const internalField of [
      'workspaceId',
      'objectKey',
      'bucket',
      'originalFilename',
      'declaredSizeBytes',
      'etag',
      'uploadIntent',
    ]) {
      expect(serialized).not.toContain(internalField);
    }
  });

  it('orders multiple Sources by createdAt DESC and then id DESC', async () => {
    const { authSubject, principal } = await createPrincipal();
    const project = await createProject(principal.workspace.id);
    const older = await createSource(
      principal.workspace.id,
      project.project.id,
      { createdAt: new Date('2026-07-15T10:00:00.000Z') },
    );
    const tiedAt = new Date('2026-07-15T11:00:00.000Z');
    const lowerId = await createSource(
      principal.workspace.id,
      project.project.id,
      {
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: tiedAt,
      },
    );
    const higherId = await createSource(
      principal.workspace.id,
      project.project.id,
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        createdAt: tiedAt,
      },
    );
    const response = await getSources(authSubject, project.project.id);

    expect(response.body.data.map(({ id }: { id: string }) => id)).toEqual([
      higherId.id,
      lowerId.id,
      older.id,
    ]);
  });

  it('uses default limit 20 and accepts explicit limits 1 and 100', async () => {
    const { authSubject, principal } = await createPrincipal();
    const project = await createProject(principal.workspace.id);

    for (const [suffix, limit] of [
      ['', 20],
      ['?limit=1', 1],
      ['?limit=100', 100],
    ] as const) {
      const response = await getSources(
        authSubject,
        project.project.id,
        suffix,
      );
      expect(response.status).toBe(200);
      expect(response.body.meta.page.limit).toBe(limit);
    }
  });

  it('generates nextCursor and returns a valid second page without repetition', async () => {
    const { authSubject, principal } = await createPrincipal();
    const project = await createProject(principal.workspace.id);
    await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        createSource(principal.workspace.id, project.project.id, {
          createdAt: new Date(`2026-07-15T1${index}:00:00.000Z`),
        }),
      ),
    );
    const first = await getSources(authSubject, project.project.id, '?limit=2');

    expect(first.body.meta.page.hasMore).toBe(true);
    expect(first.body.meta.page.nextCursor).toEqual(expect.any(String));
    const second = await getSources(
      authSubject,
      project.project.id,
      `?limit=2&cursor=${first.body.meta.page.nextCursor}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.page).toEqual({
      limit: 2,
      nextCursor: null,
      hasMore: false,
    });
    expect(
      new Set(
        [...first.body.data, ...second.body.data].map(
          ({ id }: { id: string }) => id,
        ),
      ).size,
    ).toBe(3);
  });

  it('rejects cursors bound to another workspace or Project', async () => {
    const first = await createPrincipal();
    const second = await createPrincipal();
    const firstProject = await createProject(first.principal.workspace.id);
    const secondProject = await createProject(second.principal.workspace.id);
    const anotherFirstProject = await createProject(
      first.principal.workspace.id,
      'Another project',
    );
    for (const [workspaceId, scopedProjectId] of [
      [second.principal.workspace.id, secondProject.project.id],
      [first.principal.workspace.id, anotherFirstProject.project.id],
    ] as const) {
      await createSource(workspaceId, scopedProjectId);
      await createSource(workspaceId, scopedProjectId);
      const page = await sourceService.listSources({
        workspaceId,
        projectId: scopedProjectId,
        limit: 1,
      });
      expect(page.nextCursor).toBeDefined();

      const response = await getSources(
        first.authSubject,
        firstProject.project.id,
        `?cursor=${page.nextCursor}`,
      );
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('SOURCE_QUERY_INVALID');
      expect(() => decodeSourceCursor(page.nextCursor as string)).not.toThrow();
    }
  });

  it('excludes archived Sources', async () => {
    const { authSubject, principal } = await createPrincipal();
    const project = await createProject(principal.workspace.id);
    const visible = await createSource(
      principal.workspace.id,
      project.project.id,
    );
    const archived = await createSource(
      principal.workspace.id,
      project.project.id,
      { archivedAt: new Date() },
    );
    const response = await getSources(authSubject, project.project.id);

    expect(response.body.data.map(({ id }: { id: string }) => id)).toEqual([
      visible.id,
    ]);
    expect(JSON.stringify(response.body)).not.toContain(archived.id);
  });

  it('preserves the existing PROJECT_ARCHIVED contract', async () => {
    const { authSubject, principal } = await createPrincipal();
    const project = await createProject(principal.workspace.id);
    await databaseClient.prisma.project.update({
      where: { id: project.project.id },
      data: { state: 'archived', archivedAt: new Date() },
    });
    const response = await getSources(authSubject, project.project.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PROJECT_ARCHIVED');
  });

  it('enforces real HTTP isolation between two workspaces', async () => {
    const first = await createPrincipal();
    const second = await createPrincipal();
    const firstProject = await createProject(first.principal.workspace.id);
    const secondProject = await createProject(second.principal.workspace.id);
    const firstSource = await createSource(
      first.principal.workspace.id,
      firstProject.project.id,
    );
    const secondSource = await createSource(
      second.principal.workspace.id,
      secondProject.project.id,
    );

    const firstResponse = await getSources(
      first.authSubject,
      firstProject.project.id,
    );
    const hiddenResponse = await getSources(
      first.authSubject,
      secondProject.project.id,
    );
    expect(firstResponse.body.data.map(({ id }: { id: string }) => id)).toEqual(
      [firstSource.id],
    );
    expect(JSON.stringify(firstResponse.body)).not.toContain(secondSource.id);
    expect(hiddenResponse.status).toBe(404);
  });
});
