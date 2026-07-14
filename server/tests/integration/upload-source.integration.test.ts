import { randomUUID } from 'node:crypto';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import type { DatabaseClient } from '../../src/database/database-client.js';
import { createPrismaDatabaseClient } from '../../src/database/prisma-database-client.js';
import { PrismaProjectService } from '../../src/projects/prisma-project-service.js';
import { PrismaIdentityProvisioner } from '../../src/provisioning/prisma-identity-provisioner.js';
import type {
  CreateUploadTargetInput,
  InspectUploadedObjectInput,
  ObjectStorage,
} from '../../src/storage/object-storage.js';
import { ObjectStorageUnavailableError } from '../../src/storage/object-storage.js';
import { PrismaUploadIntentService } from '../../src/uploads/prisma-upload-intent-service.js';
import {
  UploadIdempotencyConflictError,
  UploadProjectArchivedError,
  UploadProjectNotFoundError,
} from '../../src/uploads/upload-intent-service.js';

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

class SyntheticObjectStorage implements ObjectStorage {
  public readonly inputs: CreateUploadTargetInput[] = [];

  public async createUploadTarget(input: CreateUploadTargetInput) {
    this.inputs.push(input);

    return {
      method: 'PUT' as const,
      url: `https://storage.example.invalid/synthetic-target-${this.inputs.length}`,
      headers: {
        'Content-Type': input.contentType,
        'x-amz-meta-upload-intent-id': input.uploadIntentId,
      },
      expiresAt: input.expiresAt,
    };
  }

  public async inspectUploadedObject(
    input: InspectUploadedObjectInput,
  ): Promise<never> {
    void input;
    throw new Error('Unexpected object inspection.');
  }
}

const describeWithPostgres = hasTestDatabase ? describe : describe.skip;

describeWithPostgres('PostgreSQL private upload Source foundation', () => {
  let databaseClient: DatabaseClient;
  let identityProvisioner: PrismaIdentityProvisioner;
  let projectService: PrismaProjectService;
  let uploadIntentService: PrismaUploadIntentService;
  let objectStorage: SyntheticObjectStorage;
  const trackedAuthSubjects = new Set<string>();

  function createTrackedAuthSubject(): string {
    const authSubject = randomUUID();
    trackedAuthSubjects.add(authSubject);
    return authSubject;
  }

  async function createWorkspace() {
    return identityProvisioner.provision({
      authSubject: createTrackedAuthSubject(),
    });
  }

  async function createProject(workspaceId: string, title = 'Upload project') {
    return projectService.createProject({
      workspaceId,
      title,
      idempotencyKey: `project:${randomUUID()}`,
    });
  }

  async function createFixture() {
    const principal = await createWorkspace();
    const project = await createProject(principal.workspace.id);
    return { principal, project };
  }

  function createUpload(
    workspaceId: string,
    projectId: string,
    overrides: Partial<{
      filename: string;
      contentType: string;
      sizeBytes: number;
      idempotencyKey: string;
    }> = {},
  ) {
    return uploadIntentService.createUploadIntent(
      {
        workspaceId,
        projectId,
        filename: 'Episodio 01.mp4',
        contentType: 'video/mp4',
        sizeBytes: 52_428_800,
        idempotencyKey: `upload:${randomUUID()}`,
        ...overrides,
      },
      objectStorage,
    );
  }

  async function cleanupTrackedData() {
    const authSubjects = [...trackedAuthSubjects];
    const workspaces = await databaseClient.prisma.workspace.findMany({
      where: { owner: { authSubject: { in: authSubjects } } },
      select: { id: true },
    });
    const workspaceIds = workspaces.map(({ id }) => id);

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
  }

  beforeAll(() => {
    databaseClient = createPrismaDatabaseClient(requireSafeTestDatabaseUrl());
    identityProvisioner = new PrismaIdentityProvisioner(databaseClient.prisma);
    projectService = new PrismaProjectService(databaseClient.prisma);
    uploadIntentService = new PrismaUploadIntentService(databaseClient.prisma);
  });

  afterEach(async () => {
    await cleanupTrackedData();
  });

  afterAll(async () => {
    await databaseClient?.close();
  });

  beforeEach(() => {
    objectStorage = new SyntheticObjectStorage();
  });

  it('creates one Source and one UploadIntent', async () => {
    const { principal, project } = await createFixture();
    const unavailableStorage: ObjectStorage = {
      createUploadTarget: async () => {
        throw new ObjectStorageUnavailableError();
      },
      inspectUploadedObject: async () => {
        throw new ObjectStorageUnavailableError();
      },
    };
    await expect(
      uploadIntentService.createUploadIntent(
        {
          workspaceId: principal.workspace.id,
          projectId: project.project.id,
          filename: 'Episodio 01.mp4',
          contentType: 'video/mp4',
          sizeBytes: 52_428_800,
          idempotencyKey: `upload:${randomUUID()}`,
        },
        unavailableStorage,
      ),
    ).rejects.toBeInstanceOf(ObjectStorageUnavailableError);
    await expect(
      databaseClient.prisma.source.count({
        where: { workspaceId: principal.workspace.id },
      }),
    ).resolves.toBe(0);
    await expect(
      databaseClient.prisma.uploadIntent.count({
        where: { workspaceId: principal.workspace.id },
      }),
    ).resolves.toBe(0);

    const result = await createUpload(
      principal.workspace.id,
      project.project.id,
    );

    await expect(
      databaseClient.prisma.source.count({ where: { id: result.source.id } }),
    ).resolves.toBe(1);
    await expect(
      databaseClient.prisma.uploadIntent.count({
        where: { id: result.upload.handle },
      }),
    ).resolves.toBe(1);
  });

  it('persists matching Project and Workspace relationships', async () => {
    const { principal, project } = await createFixture();
    const result = await createUpload(
      principal.workspace.id,
      project.project.id,
    );
    const upload = await databaseClient.prisma.uploadIntent.findUniqueOrThrow({
      where: { id: result.upload.handle },
      include: { source: true },
    });

    expect(upload.workspaceId).toBe(principal.workspace.id);
    expect(upload.projectId).toBe(project.project.id);
    expect(upload.source.workspaceId).toBe(principal.workspace.id);
    expect(upload.source.projectId).toBe(project.project.id);
  });

  it('starts Source in submitted state', async () => {
    const { principal, project } = await createFixture();
    const result = await createUpload(
      principal.workspace.id,
      project.project.id,
    );
    const source = await databaseClient.prisma.source.findUniqueOrThrow({
      where: { id: result.source.id },
    });

    expect(source.sourceType).toBe('upload');
    expect(source.state).toBe('submitted');
    expect(source.durationMs).toBeNull();
    expect(source.archivedAt).toBeNull();
  });

  it('does not activate Source', async () => {
    const { principal, project } = await createFixture();
    const result = await createUpload(
      principal.workspace.id,
      project.project.id,
    );

    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: result.source.id },
        select: { isActive: true },
      }),
    ).resolves.toEqual({ isActive: false });
  });

  it('leaves UploadIntent incomplete', async () => {
    const { principal, project } = await createFixture();
    const result = await createUpload(
      principal.workspace.id,
      project.project.id,
    );

    await expect(
      databaseClient.prisma.uploadIntent.findUniqueOrThrow({
        where: { id: result.upload.handle },
        select: { completedAt: true },
      }),
    ).resolves.toEqual({ completedAt: null });
  });

  it('generates a unique object key for each intent', async () => {
    const { principal, project } = await createFixture();
    await Promise.all([
      createUpload(principal.workspace.id, project.project.id),
      createUpload(principal.workspace.id, project.project.id),
    ]);
    const keys = await databaseClient.prisma.uploadIntent.findMany({
      where: { workspaceId: principal.workspace.id },
      select: { objectKey: true },
    });

    expect(new Set(keys.map(({ objectKey }) => objectKey)).size).toBe(2);
  });

  it('does not place the original filename in the object key', async () => {
    const { principal, project } = await createFixture();
    const result = await createUpload(
      principal.workspace.id,
      project.project.id,
    );
    const upload = await databaseClient.prisma.uploadIntent.findUniqueOrThrow({
      where: { id: result.upload.handle },
      select: { objectKey: true },
    });

    expect(upload.objectKey).toMatch(
      /^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp4$/,
    );
    expect(upload.objectKey).not.toContain('Episodio');
  });

  it('replays sequential creation without duplicates', async () => {
    const { principal, project } = await createFixture();
    const idempotencyKey = `upload:${randomUUID()}`;
    const first = await createUpload(
      principal.workspace.id,
      project.project.id,
      { idempotencyKey },
    );
    const replay = await createUpload(
      principal.workspace.id,
      project.project.id,
      { idempotencyKey },
    );

    expect(replay.replayed).toBe(true);
    expect(replay.source.id).toBe(first.source.id);
    expect(replay.upload.handle).toBe(first.upload.handle);
    expect(replay.upload.url).not.toBe(first.upload.url);
    await expect(
      databaseClient.prisma.uploadIntent.count({
        where: { workspaceId: principal.workspace.id },
      }),
    ).resolves.toBe(1);
  });

  it('serializes concurrent creation without duplicates', async () => {
    const { principal, project } = await createFixture();
    const idempotencyKey = `upload:${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        createUpload(principal.workspace.id, project.project.id, {
          idempotencyKey,
        }),
      ),
    );

    expect(new Set(results.map(({ source }) => source.id)).size).toBe(1);
    expect(new Set(results.map(({ upload }) => upload.handle)).size).toBe(1);
    expect(results.filter(({ replayed }) => !replayed)).toHaveLength(1);
    expect(results.filter(({ replayed }) => replayed)).toHaveLength(7);
    await expect(
      databaseClient.prisma.source.count({
        where: { workspaceId: principal.workspace.id },
      }),
    ).resolves.toBe(1);
    await expect(
      databaseClient.prisma.uploadIntent.count({
        where: { workspaceId: principal.workspace.id },
      }),
    ).resolves.toBe(1);
  });

  it('rejects a different payload for the same idempotency key', async () => {
    const { principal, project } = await createFixture();
    const idempotencyKey = `upload:${randomUUID()}`;
    await createUpload(principal.workspace.id, project.project.id, {
      idempotencyKey,
    });

    await expect(
      createUpload(principal.workspace.id, project.project.id, {
        idempotencyKey,
        sizeBytes: 1,
      }),
    ).rejects.toBeInstanceOf(UploadIdempotencyConflictError);
  });

  it('allows the same idempotency key in another workspace', async () => {
    const first = await createFixture();
    const second = await createFixture();
    const idempotencyKey = `upload:${randomUUID()}`;
    const [uploadA, uploadB] = await Promise.all([
      createUpload(first.principal.workspace.id, first.project.project.id, {
        idempotencyKey,
      }),
      createUpload(second.principal.workspace.id, second.project.project.id, {
        idempotencyKey,
      }),
    ]);

    expect(uploadA.source.id).not.toBe(uploadB.source.id);
  });

  it('treats another workspace Project as not found', async () => {
    const first = await createFixture();
    const second = await createWorkspace();

    await expect(
      createUpload(second.workspace.id, first.project.project.id),
    ).rejects.toBeInstanceOf(UploadProjectNotFoundError);

    await databaseClient.prisma.project.update({
      where: { id: first.project.project.id },
      data: { state: 'archived', archivedAt: new Date() },
    });
    await expect(
      createUpload(first.principal.workspace.id, first.project.project.id),
    ).rejects.toBeInstanceOf(UploadProjectArchivedError);
  });

  it('enforces tenant-safe Source and Project consistency in PostgreSQL', async () => {
    const first = await createFixture();
    const second = await createWorkspace();

    await expect(
      databaseClient.prisma.source.create({
        data: {
          workspaceId: second.workspace.id,
          projectId: first.project.project.id,
          safeReference: 'cross-tenant.mp4',
        },
      }),
    ).rejects.toSatisfy(isForeignKeyViolation);
  });

  it('rejects a Source for a nonexistent Project through the foreign key', async () => {
    const principal = await createWorkspace();

    await expect(
      databaseClient.prisma.source.create({
        data: {
          workspaceId: principal.workspace.id,
          projectId: randomUUID(),
          safeReference: 'missing-project.mp4',
        },
      }),
    ).rejects.toSatisfy(isForeignKeyViolation);
  });

  it('restricts deleting a Project that owns a Source', async () => {
    const { principal, project } = await createFixture();
    await createUpload(principal.workspace.id, project.project.id);

    await expect(
      databaseClient.prisma.project.delete({
        where: { id: project.project.id },
      }),
    ).rejects.toSatisfy(isForeignKeyViolation);
  });

  it('keeps Project listing behavior unchanged', async () => {
    const { principal, project } = await createFixture();
    await createUpload(principal.workspace.id, project.project.id);
    const listed = await projectService.listProjects({
      workspaceId: principal.workspace.id,
      limit: 20,
    });

    expect(listed.projects.map(({ id }) => id)).toEqual([project.project.id]);
  });

  it('cleans synthetic rows in UploadIntent to User order', async () => {
    const { principal, project } = await createFixture();
    await createUpload(principal.workspace.id, project.project.id);
    await cleanupTrackedData();

    await expect(
      databaseClient.prisma.uploadIntent.count({
        where: { workspaceId: principal.workspace.id },
      }),
    ).resolves.toBe(0);
    await expect(
      databaseClient.prisma.source.count({
        where: { workspaceId: principal.workspace.id },
      }),
    ).resolves.toBe(0);
  });

  it('leaves no synthetic data after directed cleanup', async () => {
    const { principal, project } = await createFixture();
    await createUpload(principal.workspace.id, project.project.id);
    const workspaceId = principal.workspace.id;
    await cleanupTrackedData();

    const [uploads, sources, projects, workspaces] = await Promise.all([
      databaseClient.prisma.uploadIntent.count({ where: { workspaceId } }),
      databaseClient.prisma.source.count({ where: { workspaceId } }),
      databaseClient.prisma.project.count({ where: { workspaceId } }),
      databaseClient.prisma.workspace.count({ where: { id: workspaceId } }),
    ]);
    expect([uploads, sources, projects, workspaces]).toEqual([0, 0, 0, 0]);
  });
});

function isForeignKeyViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if ('code' in error && error.code === 'P2003') {
    return true;
  }

  if (
    !('cause' in error) ||
    typeof error.cause !== 'object' ||
    error.cause === null
  ) {
    return false;
  }

  return (
    'code' in error.cause &&
    (error.cause.code === '23503' || error.cause.code === '23001')
  );
}
