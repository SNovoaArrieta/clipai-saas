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
import {
  ObjectStorageNotFoundError,
  type CreateUploadTargetInput,
  type InspectUploadedObjectInput,
  type ObjectStorage,
  type UploadedObjectMetadata,
} from '../../src/storage/object-storage.js';
import { PrismaUploadIntentService } from '../../src/uploads/prisma-upload-intent-service.js';
import {
  UploadIntentNotFoundError,
  UploadMetadataMismatchError,
  UploadNotCompletedError,
  UploadPersistenceError,
  UploadProjectArchivedError,
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

  const url = new URL(configuredTestDatabaseUrl);
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

class ControlledObjectStorage implements ObjectStorage {
  public readonly targets = new Map<string, CreateUploadTargetInput>();
  public inspectCount = 0;
  public missing = false;
  public beforeInspect: ((sequence: number) => Promise<void>) | undefined;
  public metadataOverride:
    | Partial<UploadedObjectMetadata>
    | ((
        input: CreateUploadTargetInput,
        sequence: number,
      ) => Partial<UploadedObjectMetadata>)
    | undefined;

  public async createUploadTarget(input: CreateUploadTargetInput) {
    this.targets.set(input.objectKey, input);
    return {
      method: 'PUT' as const,
      url: 'https://storage.example.invalid/synthetic-private-target',
      headers: {
        'Content-Type': input.contentType,
        'x-amz-meta-upload-intent-id': input.uploadIntentId,
      },
      expiresAt: input.expiresAt,
    };
  }

  public async inspectUploadedObject(
    input: InspectUploadedObjectInput,
  ): Promise<UploadedObjectMetadata> {
    this.inspectCount += 1;
    await this.beforeInspect?.(this.inspectCount);
    if (this.missing) {
      throw new ObjectStorageNotFoundError();
    }

    const target = this.targets.get(input.objectKey);
    if (target === undefined) {
      throw new Error('Object key was not issued by the controlled storage.');
    }

    const override =
      typeof this.metadataOverride === 'function'
        ? this.metadataOverride(target, this.inspectCount)
        : (this.metadataOverride ?? {});
    return {
      sizeBytes: target.sizeBytes,
      contentType: target.contentType,
      etag: '"opaque-synthetic-etag"',
      metadata: { 'upload-intent-id': target.uploadIntentId },
      ...override,
    };
  }
}

const describeWithPostgres = hasTestDatabase ? describe : describe.skip;

describeWithPostgres('PostgreSQL uploaded object confirmation', () => {
  let databaseClient: DatabaseClient;
  let provisioner: PrismaIdentityProvisioner;
  let projectService: PrismaProjectService;
  let uploadService: PrismaUploadIntentService;
  let storage: ControlledObjectStorage;
  const trackedAuthSubjects = new Set<string>();

  async function createWorkspace() {
    const authSubject = randomUUID();
    trackedAuthSubjects.add(authSubject);
    return provisioner.provision({ authSubject });
  }

  async function createProject(
    workspaceId: string,
    title = 'Confirmation project',
  ) {
    return projectService.createProject({
      workspaceId,
      title,
      idempotencyKey: `project:${randomUUID()}`,
    });
  }

  async function createFixture() {
    const principal = await createWorkspace();
    const project = await createProject(principal.workspace.id);
    const created = await uploadService.createUploadIntent(
      {
        workspaceId: principal.workspace.id,
        projectId: project.project.id,
        filename: 'Synthetic episode.mp4',
        contentType: 'video/mp4',
        sizeBytes: 4_096,
        idempotencyKey: `upload:${randomUUID()}`,
      },
      storage,
    );
    return { principal, project: project.project, created };
  }

  function confirm(fixture: Awaited<ReturnType<typeof createFixture>>) {
    return uploadService.confirmUploadIntent(
      {
        workspaceId: fixture.principal.workspace.id,
        projectId: fixture.project.id,
        uploadHandle: fixture.created.upload.handle,
      },
      storage,
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
    provisioner = new PrismaIdentityProvisioner(databaseClient.prisma);
    projectService = new PrismaProjectService(databaseClient.prisma);
    uploadService = new PrismaUploadIntentService(databaseClient.prisma);
  });
  beforeEach(() => {
    storage = new ControlledObjectStorage();
  });
  afterEach(cleanupTrackedData);
  afterAll(async () => databaseClient?.close());

  it('1. successful confirmation updates the intent', async () => {
    const fixture = await createFixture();
    expect(fixture.created.source.state).toBe('submitted');
    const result = await confirm(fixture);
    expect(result.upload.status).toBe('completed');
    await expect(
      databaseClient.prisma.uploadIntent.count({
        where: {
          id: fixture.created.upload.handle,
          completedAt: { not: null },
        },
      }),
    ).resolves.toBe(1);
    await expect(
      databaseClient.prisma.project.findUniqueOrThrow({
        where: { id: fixture.project.id },
        select: { state: true, archivedAt: true },
      }),
    ).resolves.toEqual({ state: 'draft', archivedAt: null });
  });

  it('2. advances Source to validating', async () => {
    const fixture = await createFixture();
    await confirm(fixture);
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.created.source.id },
        select: { state: true, archivedAt: true },
      }),
    ).resolves.toEqual({ state: 'validating', archivedAt: null });
  });

  it('3. persists one completedAt timestamp', async () => {
    const fixture = await createFixture();
    await databaseClient.prisma.uploadIntent.update({
      where: { id: fixture.created.upload.handle },
      data: { expiresAt: new Date('2026-07-13T00:00:00.000Z') },
    });
    const result = await confirm(fixture);
    const stored = await databaseClient.prisma.uploadIntent.findUniqueOrThrow({
      where: { id: fixture.created.upload.handle },
      select: { completedAt: true },
    });
    expect(stored.completedAt?.toISOString()).toBe(result.upload.completedAt);
  });

  it('4. persists only normalized observed metadata and opaque ETag', async () => {
    const fixture = await createFixture();
    storage.metadataOverride = {
      contentType: ' VIDEO/MP4 ',
      etag: ' "opaque-value" ',
    };
    await confirm(fixture);
    await expect(
      databaseClient.prisma.uploadIntent.findUniqueOrThrow({
        where: { id: fixture.created.upload.handle },
        select: {
          observedSizeBytes: true,
          observedContentType: true,
          storageEtag: true,
        },
      }),
    ).resolves.toEqual({
      observedSizeBytes: 4_096n,
      observedContentType: 'video/mp4',
      storageEtag: '"opaque-value"',
    });

    storage.metadataOverride = { etag: '   ' };
    const withoutEtag = await createFixture();
    await confirm(withoutEtag);
    await expect(
      databaseClient.prisma.uploadIntent.findUniqueOrThrow({
        where: { id: withoutEtag.created.upload.handle },
        select: { storageEtag: true },
      }),
    ).resolves.toEqual({ storageEtag: null });
  });

  it('5. leaves Source inactive with unknown duration', async () => {
    const fixture = await createFixture();
    await confirm(fixture);
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.created.source.id },
        select: { isActive: true, durationMs: true, archivedAt: true },
      }),
    ).resolves.toEqual({
      isActive: false,
      durationMs: null,
      archivedAt: null,
    });
  });

  it('6. never advances Source to accepted', async () => {
    const fixture = await createFixture();
    const result = await confirm(fixture);
    expect(result.source.state).toBe('validating');
    await expect(
      databaseClient.prisma.source.count({
        where: { id: fixture.created.source.id, state: 'accepted' },
      }),
    ).resolves.toBe(0);

    const unexpected = await createFixture();
    await databaseClient.prisma.source.update({
      where: { id: unexpected.created.source.id },
      data: { state: 'accepted', archivedAt: new Date() },
    });
    await expect(confirm(unexpected)).rejects.toBeInstanceOf(
      UploadPersistenceError,
    );
    expect(storage.inspectCount).toBe(1);
  });

  it('7. replays active Projects and rejects archived completed replays without another HEAD', async () => {
    const fixture = await createFixture();
    const first = await confirm(fixture);
    storage.metadataOverride = { sizeBytes: 8_192 };
    const replay = await confirm(fixture);
    expect(replay.replayed).toBe(true);
    expect(replay.source.id).toBe(first.source.id);
    expect(replay.upload).toEqual(first.upload);
    expect(storage.inspectCount).toBe(1);
    await expect(databaseClient.prisma.uploadIntent.count()).resolves.toBe(1);

    const [intentBeforeArchive, sourceBeforeArchive] = await Promise.all([
      databaseClient.prisma.uploadIntent.findUniqueOrThrow({
        where: { id: fixture.created.upload.handle },
      }),
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.created.source.id },
      }),
    ]);
    await databaseClient.prisma.project.update({
      where: { id: fixture.project.id },
      data: { state: 'archived', archivedAt: new Date() },
    });

    await expect(confirm(fixture)).rejects.toBeInstanceOf(
      UploadProjectArchivedError,
    );
    expect(storage.inspectCount).toBe(1);
    await expect(
      databaseClient.prisma.uploadIntent.findUniqueOrThrow({
        where: { id: fixture.created.upload.handle },
      }),
    ).resolves.toEqual(intentBeforeArchive);
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.created.source.id },
      }),
    ).resolves.toEqual(sourceBeforeArchive);
  });

  it('8. makes concurrent confirmations idempotent with coherent metadata', async () => {
    const fixture = await createFixture();
    let releaseFirstInspection: (() => void) | undefined;
    const firstInspectionReached = new Promise<void>((resolve) => {
      storage.beforeInspect = async (sequence) => {
        if (sequence !== 1) {
          return;
        }

        resolve();
        await new Promise<void>((release) => {
          releaseFirstInspection = release;
        });
      };
    });

    const first = confirm(fixture);
    await firstInspectionReached;
    const concurrent = Array.from({ length: 7 }, () => confirm(fixture));
    expect(storage.inspectCount).toBe(1);
    if (releaseFirstInspection === undefined) {
      throw new Error('The first object inspection was not blocked.');
    }
    releaseFirstInspection();
    const results = await Promise.all([first, ...concurrent]);

    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(7);
    expect(storage.inspectCount).toBe(1);
    expect(new Set(results.map((result) => result.source.id))).toEqual(
      new Set([fixture.created.source.id]),
    );
    expect(
      new Set(results.map((result) => result.upload.completedAt)).size,
    ).toBe(1);
    expect(new Set(results.map((result) => result.upload.sizeBytes))).toEqual(
      new Set([4_096]),
    );
    expect(new Set(results.map((result) => result.upload.contentType))).toEqual(
      new Set(['video/mp4']),
    );
    expect(results.map((result) => result.upload)).toEqual(
      Array.from({ length: 8 }, () => results[0]?.upload),
    );

    const stored = await databaseClient.prisma.uploadIntent.findUniqueOrThrow({
      where: { id: fixture.created.upload.handle },
      select: {
        observedSizeBytes: true,
        observedContentType: true,
        storageEtag: true,
        completedAt: true,
      },
    });
    expect(stored.observedSizeBytes).toBe(4_096n);
    expect(stored.observedContentType).toBe('video/mp4');
    expect(stored.storageEtag).toBe('"opaque-synthetic-etag"');
    expect(stored.completedAt?.toISOString()).toBe(
      results[0]?.upload.completedAt,
    );
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.created.source.id },
        select: { state: true },
      }),
    ).resolves.toEqual({ state: 'validating' });
  });

  it('9. missing object does not modify either row', async () => {
    const fixture = await createFixture();
    storage.missing = true;
    await expect(confirm(fixture)).rejects.toBeInstanceOf(
      UploadNotCompletedError,
    );
    await expect(
      databaseClient.prisma.uploadIntent.findUniqueOrThrow({
        where: { id: fixture.created.upload.handle },
        select: { completedAt: true },
      }),
    ).resolves.toEqual({ completedAt: null });
    await expect(
      databaseClient.prisma.source.findUniqueOrThrow({
        where: { id: fixture.created.source.id },
        select: { state: true },
      }),
    ).resolves.toEqual({ state: 'submitted' });
  });

  it('10. size mismatch does not modify rows', async () => {
    const fixture = await createFixture();
    for (const sizeBytes of [0, -1, 1.5, 262_144_001, 4_095]) {
      storage.metadataOverride = { sizeBytes };
      await expect(confirm(fixture)).rejects.toBeInstanceOf(
        UploadMetadataMismatchError,
      );
    }
    await expect(
      databaseClient.prisma.uploadIntent.count({
        where: { completedAt: { not: null } },
      }),
    ).resolves.toBe(0);
  });

  it('11. Content-Type mismatch does not modify rows', async () => {
    const fixture = await createFixture();
    for (const contentType of ['', 'audio/mpeg', 'video/mp4; charset=binary']) {
      storage.metadataOverride = { contentType };
      await expect(confirm(fixture)).rejects.toBeInstanceOf(
        UploadMetadataMismatchError,
      );
    }
    await expect(
      databaseClient.prisma.source.count({ where: { state: 'validating' } }),
    ).resolves.toBe(0);
  });

  it('12. intent metadata mismatch does not modify rows', async () => {
    const fixture = await createFixture();
    storage.metadataOverride = { metadata: {} };
    await expect(confirm(fixture)).rejects.toBeInstanceOf(
      UploadMetadataMismatchError,
    );
    storage.metadataOverride = { metadata: { 'upload-intent-id': '' } };
    await expect(confirm(fixture)).rejects.toBeInstanceOf(
      UploadMetadataMismatchError,
    );
    storage.metadataOverride = {
      metadata: { 'upload-intent-id': randomUUID() },
    };
    await expect(confirm(fixture)).rejects.toBeInstanceOf(
      UploadMetadataMismatchError,
    );
    storage.metadataOverride = {
      metadata: {
        'upload-intent-id': fixture.created.upload.handle,
        'Upload-Intent-Id': fixture.created.upload.handle,
      },
    };
    await expect(confirm(fixture)).rejects.toBeInstanceOf(
      UploadMetadataMismatchError,
    );
    await expect(
      databaseClient.prisma.uploadIntent.count({
        where: { completedAt: { not: null } },
      }),
    ).resolves.toBe(0);
  });

  it('13. cross-workspace intent is invisible and performs no HEAD', async () => {
    const fixture = await createFixture();
    const other = await createWorkspace();
    await expect(
      uploadService.confirmUploadIntent(
        {
          workspaceId: other.workspace.id,
          projectId: fixture.project.id,
          uploadHandle: fixture.created.upload.handle,
        },
        storage,
      ),
    ).rejects.toBeInstanceOf(UploadIntentNotFoundError);
    expect(storage.inspectCount).toBe(0);
  });

  it('14. intent under a different Project is invisible', async () => {
    const fixture = await createFixture();
    const otherProject = await createProject(
      fixture.principal.workspace.id,
      'Other project',
    );
    await expect(
      uploadService.confirmUploadIntent(
        {
          workspaceId: fixture.principal.workspace.id,
          projectId: otherProject.project.id,
          uploadHandle: fixture.created.upload.handle,
        },
        storage,
      ),
    ).rejects.toBeInstanceOf(UploadIntentNotFoundError);
    expect(storage.inspectCount).toBe(0);
  });

  it('15. archived Project blocks confirmation before HEAD', async () => {
    const fixture = await createFixture();
    await databaseClient.prisma.project.update({
      where: { id: fixture.project.id },
      data: { state: 'archived', archivedAt: new Date() },
    });
    await expect(confirm(fixture)).rejects.toBeInstanceOf(
      UploadProjectArchivedError,
    );
    expect(storage.inspectCount).toBe(0);
  });

  it('16. tenant-safe constraints reject a mismatched workspace relation', async () => {
    const fixture = await createFixture();
    const other = await createWorkspace();
    await expect(
      databaseClient.prisma.uploadIntent.update({
        where: { id: fixture.created.upload.handle },
        data: { workspaceId: other.workspace.id },
      }),
    ).rejects.toThrow();
  });

  it('17. related UploadIntent restricts Source deletion', async () => {
    const fixture = await createFixture();
    await expect(
      databaseClient.prisma.source.delete({
        where: { id: fixture.created.source.id },
      }),
    ).rejects.toThrow();
  });

  it('18. supports cleanup only in dependency-safe order', async () => {
    await createFixture();
    await cleanupTrackedData();
    await expect(databaseClient.prisma.uploadIntent.count()).resolves.toBe(0);
    await expect(databaseClient.prisma.source.count()).resolves.toBe(0);
    await expect(databaseClient.prisma.project.count()).resolves.toBe(0);
  });

  it('19. starts the final database assertion without synthetic rows', async () => {
    await expect(
      Promise.all([
        databaseClient.prisma.uploadIntent.count(),
        databaseClient.prisma.source.count(),
        databaseClient.prisma.project.count(),
        databaseClient.prisma.workspace.count(),
        databaseClient.prisma.user.count(),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0]);
  });
});
