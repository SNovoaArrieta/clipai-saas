import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import request from 'supertest';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import type { IdentityVerifier } from '../src/identity/identity-verifier.js';
import type {
  MediaInspector,
  MediaInspectionResult,
} from '../src/media/media-inspector.js';
import type { IdentityProvisioner } from '../src/provisioning/identity-provisioner.js';
import {
  ObjectStorageNotFoundError,
  type ObjectStorage,
} from '../src/storage/object-storage.js';
import {
  SourceNotReadyForValidationError,
  SourceValidationInspectorUnavailableError,
  SourceValidationPersistenceError,
  SourceValidationProjectArchivedError,
  SourceValidationProjectNotFoundError,
  SourceValidationSourceNotFoundError,
  SourceValidationStorageUnavailableError,
  StorageRevisionUnavailableError,
} from '../src/sources/source-validation-errors.js';
import type {
  FinalizeSourceValidationInput,
  SourceValidationRepository,
  SourceValidationSnapshot,
} from '../src/sources/source-validation-repository.js';
import {
  DefaultSourceValidationService,
  type SourceValidationService,
} from '../src/sources/source-validation-service.js';
import type { SourceView } from '../src/sources/source-serializer.js';
import {
  parseSourceValidationRequest,
  SourceValidationInputError,
} from '../src/sources/source-validation-validator.js';

const workspaceId = '3ad971a4-79a2-4a3a-9d15-0c9220d31955';
const projectId = '9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482';
const sourceId = '87c00c7d-d959-46f1-a760-e067a42ae525';
const authorization = 'Bearer verified-source-validation-token';

function sourceView(overrides: Partial<SourceView> = {}): SourceView {
  return {
    id: sourceId,
    projectId,
    sourceType: 'upload',
    safeReference: 'episode.mp4',
    state: 'accepted',
    isActive: false,
    durationMs: 12_345,
    createdAt: '2026-07-29T20:00:00.000Z',
    updatedAt: '2026-07-29T20:01:00.000Z',
    ...overrides,
  };
}

function mediaInspector(
  result: MediaInspectionResult = {
    outcome: 'accepted',
    container: 'mp4',
    contentType: 'video/mp4',
    durationMs: 12_345,
    hasAudio: true,
    hasVideo: true,
  },
): MediaInspector {
  return { inspect: vi.fn(async () => result) };
}

function objectStorage(
  body: readonly Uint8Array[] = [new Uint8Array([1, 2, 3])],
): ObjectStorage {
  return {
    createUploadTarget: vi.fn(async () => {
      throw new Error('Unexpected upload target creation.');
    }),
    inspectUploadedObject: vi.fn(async () => {
      throw new Error('Unexpected HEAD inspection.');
    }),
    readConfirmedObject: vi.fn(async () => ({
      sizeBytes: body.reduce((sum, chunk) => sum + chunk.byteLength, 0),
      body: (async function* () {
        for (const chunk of body) {
          yield chunk;
        }
      })(),
    })),
  };
}

function validationService(
  overrides: Partial<SourceValidationService> = {},
): SourceValidationService {
  return {
    validateSource: vi.fn(async () => ({
      source: sourceView(),
      replayed: false,
    })),
    ...overrides,
  };
}

function appDependencies(
  overrides: Partial<AppDependencies> = {},
): AppDependencies {
  const identityVerifier: IdentityVerifier = {
    verifyAccessToken: vi.fn(async () => ({
      authSubject: '5e85dcbb-e70a-4744-981b-a4fa96a230b1',
      email: 'private@example.com',
    })),
  };
  const identityProvisioner: IdentityProvisioner = {
    provision: vi.fn(async () => ({
      user: {
        id: '0a2ae619-85a6-4571-bccd-3e882cbd2fc8',
        email: 'private@example.com',
      },
      workspace: { id: workspaceId },
    })),
  };
  return {
    identityVerifier,
    identityProvisioner,
    sourceValidationService: validationService(),
    objectStorage: objectStorage(),
    mediaInspector: mediaInspector(),
    ...overrides,
  };
}

function validateSource(dependencies: AppDependencies, body?: unknown) {
  const call = request(createApp(dependencies))
    .post(`/api/v1/projects/${projectId}/sources/${sourceId}/validate`)
    .set('Authorization', authorization);
  return body === undefined ? call : call.send(body as object);
}

describe('Source validation HTTP contract', () => {
  it('is naturally idempotent and returns only the safe Source view', async () => {
    const service = validationService();
    const dependencies = appDependencies({
      sourceValidationService: service,
    });

    const response = await validateSource(dependencies);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ data: sourceView() });
    expect(response.headers['idempotency-replayed']).toBeUndefined();
    expect(response.headers['source-validation-replayed']).toBeUndefined();
    expect(service.validateSource).toHaveBeenCalledWith(
      { workspaceId, projectId, sourceId },
      dependencies.objectStorage,
      dependencies.mediaInspector,
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /bucket|objectKey|storageRevision|etag|path|stderr/i,
    );
  });

  it('requires authentication before exposing Source visibility', async () => {
    const response = await request(createApp(appDependencies())).post(
      `/api/v1/projects/${projectId}/sources/${sourceId}/validate`,
    );
    expect(response.status).toBe(401);
  });

  it('marks a terminal replay without requiring an idempotency key', async () => {
    const response = await validateSource(
      appDependencies({
        sourceValidationService: validationService({
          validateSource: vi.fn(async () => ({
            source: sourceView({ state: 'rejected', durationMs: null }),
            replayed: true,
          })),
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers['source-validation-replayed']).toBe('true');
  });

  it.each([
    [`/api/v1/projects/not-a-uuid/sources/${sourceId}/validate`, {}],
    [`/api/v1/projects/${projectId}/sources/not-a-uuid/validate`, {}],
    [
      `/api/v1/projects/${projectId}/sources/${sourceId}/validate`,
      { objectKey: 'forbidden' },
    ],
  ])('rejects invalid parameters or body', async (path, body) => {
    const service = validationService();
    const response = await request(
      createApp(appDependencies({ sourceValidationService: service })),
    )
      .post(path)
      .set('Authorization', authorization)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SOURCE_VALIDATION_INPUT_INVALID');
    expect(service.validateSource).not.toHaveBeenCalled();
  });

  it('rejects query fields and malformed JSON', async () => {
    const queryResponse = await request(createApp(appDependencies()))
      .post(
        `/api/v1/projects/${projectId}/sources/${sourceId}/validate?workspaceId=${workspaceId}`,
      )
      .set('Authorization', authorization)
      .send({});
    const malformedResponse = await request(createApp(appDependencies()))
      .post(`/api/v1/projects/${projectId}/sources/${sourceId}/validate`)
      .set('Authorization', authorization)
      .set('Content-Type', 'application/json')
      .send('{');

    expect(queryResponse.status).toBe(400);
    expect(queryResponse.body.error.code).toBe(
      'SOURCE_VALIDATION_INPUT_INVALID',
    );
    expect(malformedResponse.status).toBe(400);
    expect(malformedResponse.body.error.code).toBe(
      'SOURCE_VALIDATION_INPUT_INVALID',
    );
  });

  it('rejects inherited enumerable body fields', () => {
    const body = Object.create({ objectKey: 'forbidden' }) as object;
    expect(() =>
      parseSourceValidationRequest({
        params: { projectId, sourceId },
        query: {},
        body,
      } as unknown as Request),
    ).toThrow(SourceValidationInputError);
  });

  it.each([
    [new SourceValidationProjectNotFoundError(), 404, 'PROJECT_NOT_FOUND'],
    [new SourceValidationProjectArchivedError(), 409, 'PROJECT_ARCHIVED'],
    [new SourceValidationSourceNotFoundError(), 404, 'SOURCE_NOT_FOUND'],
    [
      new SourceNotReadyForValidationError(),
      409,
      'SOURCE_NOT_READY_FOR_VALIDATION',
    ],
    [
      new StorageRevisionUnavailableError(),
      503,
      'STORAGE_REVISION_UNAVAILABLE',
    ],
    [
      new SourceValidationStorageUnavailableError(),
      503,
      'OBJECT_STORAGE_UNAVAILABLE',
    ],
    [
      new SourceValidationInspectorUnavailableError(),
      503,
      'MEDIA_INSPECTOR_UNAVAILABLE',
    ],
    [
      new SourceValidationPersistenceError('unavailable'),
      503,
      'PERSISTENCE_UNAVAILABLE',
    ],
  ])('maps domain errors safely', async (error, status, code) => {
    const response = await validateSource(
      appDependencies({
        sourceValidationService: validationService({
          validateSource: vi.fn(async () => {
            throw error;
          }),
        }),
      }),
      {},
    );

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(
      /bucket|objectKey|storageRevision|etag|stack|stderr/i,
    );
  });
});

const snapshot: SourceValidationSnapshot = {
  objectKey: 'private/internal/object-key',
  storageRevision: 'opaque-provider-version',
  observedSizeBytes: 3,
  observedContentType: 'video/mp4',
};

function repository(
  overrides: Partial<SourceValidationRepository> = {},
): SourceValidationRepository {
  return {
    preflight: vi.fn(async () => ({ kind: 'ready' as const, snapshot })),
    finalize: vi.fn(async (input: FinalizeSourceValidationInput) => ({
      source: {
        id: sourceId,
        projectId,
        sourceType: 'upload' as const,
        safeReference: 'episode.mp4',
        state: input.disposition.state,
        isActive: false,
        durationMs: input.disposition.durationMs,
        createdAt: new Date('2026-07-29T20:00:00.000Z'),
        updatedAt: new Date('2026-07-29T20:01:00.000Z'),
      },
      replayed: false,
    })),
    ...overrides,
  };
}

describe('Source validation orchestration', () => {
  it('returns terminal replay without storage or MediaInspector I/O', async () => {
    const storage = objectStorage();
    const inspector = mediaInspector();
    const service = new DefaultSourceValidationService(
      repository({
        preflight: vi.fn(async () => ({
          kind: 'terminal' as const,
          source: {
            id: sourceId,
            projectId,
            sourceType: 'upload' as const,
            safeReference: 'episode.mp4',
            state: 'rejected' as const,
            isActive: false,
            durationMs: null,
            createdAt: new Date('2026-07-29T20:00:00.000Z'),
            updatedAt: new Date('2026-07-29T20:01:00.000Z'),
          },
        })),
      }),
    );

    const result = await service.validateSource(
      { workspaceId, projectId, sourceId },
      storage,
      inspector,
    );

    expect(result.source.state).toBe('rejected');
    expect(result.replayed).toBe(true);
    expect(storage.readConfirmedObject).not.toHaveBeenCalled();
    expect(inspector.inspect).not.toHaveBeenCalled();
  });

  it('streams the exact revision to a private temporary file and accepts', async () => {
    const storage = objectStorage([
      new Uint8Array([1]),
      new Uint8Array([2, 3]),
    ]);
    let inspectedPath = '';
    const inspector: MediaInspector = {
      inspect: vi.fn(async ({ filePath }) => {
        inspectedPath = filePath;
        expect([...(await readFile(filePath))]).toEqual([1, 2, 3]);
        return {
          outcome: 'accepted' as const,
          container: 'mp4' as const,
          contentType: 'video/mp4' as const,
          durationMs: 12_345,
          hasAudio: true,
          hasVideo: true,
        };
      }),
    };
    const sourceRepository = repository();
    const service = new DefaultSourceValidationService(sourceRepository);

    const result = await service.validateSource(
      { workspaceId, projectId, sourceId },
      storage,
      inspector,
    );

    expect(result.source).toEqual(sourceView());
    expect(storage.readConfirmedObject).toHaveBeenCalledWith({
      objectKey: snapshot.objectKey,
      storageRevision: snapshot.storageRevision,
      expectedSizeBytes: 3,
      maximumSizeBytes: 262_144_000,
      timeoutMilliseconds: 120_000,
    });
    expect(sourceRepository.finalize).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      sourceId,
      storageRevision: snapshot.storageRevision,
      disposition: { state: 'accepted', durationMs: 12_345n },
    });
    await expect(access(inspectedPath)).rejects.toBeDefined();
  });

  it('persists rejected only for a completed MediaInspector rejection', async () => {
    const sourceRepository = repository();
    const service = new DefaultSourceValidationService(sourceRepository);

    await service.validateSource(
      { workspaceId, projectId, sourceId },
      objectStorage(),
      mediaInspector({
        outcome: 'rejected',
        reason: 'invalid_media',
      }),
    );

    expect(sourceRepository.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: { state: 'rejected', durationMs: null },
      }),
    );
  });

  it('keeps the Source validating when the exact revision is missing', async () => {
    const storage = objectStorage();
    storage.readConfirmedObject = vi.fn(async () => {
      throw new ObjectStorageNotFoundError();
    });
    const sourceRepository = repository();
    const service = new DefaultSourceValidationService(sourceRepository);

    await expect(
      service.validateSource(
        { workspaceId, projectId, sourceId },
        storage,
        mediaInspector(),
      ),
    ).rejects.toBeInstanceOf(StorageRevisionUnavailableError);
    expect(sourceRepository.finalize).not.toHaveBeenCalled();
  });

  it('does not finalize a short or oversized stream', async () => {
    for (const chunks of [
      [new Uint8Array([1, 2])],
      [new Uint8Array([1, 2, 3, 4])],
    ]) {
      const sourceRepository = repository();
      const service = new DefaultSourceValidationService(sourceRepository);
      await expect(
        service.validateSource(
          { workspaceId, projectId, sourceId },
          objectStorage(chunks),
          mediaInspector(),
        ),
      ).rejects.toBeInstanceOf(StorageRevisionUnavailableError);
      expect(sourceRepository.finalize).not.toHaveBeenCalled();
    }
  });
});

describe('Source validation environment configuration', () => {
  it('accepts explicit bounded download settings and ffprobe path', () => {
    expect(
      loadEnv({
        FFPROBE_PATH: resolve('provisioned-ffprobe'),
        MEDIA_VALIDATION_MAX_BYTES: '262144000',
        MEDIA_VALIDATION_DOWNLOAD_TIMEOUT_MS: '120000',
      }),
    ).toMatchObject({
      ffprobePath: resolve('provisioned-ffprobe'),
      mediaValidationMaxBytes: 262_144_000,
      mediaValidationDownloadTimeoutMs: 120_000,
    });
  });

  it.each([
    ['MEDIA_VALIDATION_MAX_BYTES', '0'],
    ['MEDIA_VALIDATION_MAX_BYTES', '262144001'],
    ['MEDIA_VALIDATION_DOWNLOAD_TIMEOUT_MS', '999'],
    ['MEDIA_VALIDATION_DOWNLOAD_TIMEOUT_MS', '300001'],
  ])('rejects an unsafe %s value', (name, value) => {
    expect(() => loadEnv({ [name]: value })).toThrow(`Invalid ${name}`);
  });

  it('requires an explicitly provisioned ffprobe path in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        AUTH_MODE: 'supabase',
        SUPABASE_URL: 'https://project.supabase.co',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/clipai',
        STORAGE_MODE: 's3',
        S3_ENDPOINT: 'https://storage.example.invalid',
        S3_REGION: 'example-region-1',
        S3_BUCKET: 'private-example-bucket',
        S3_ACCESS_KEY_ID: 'EXAMPLE_ACCESS_KEY_ID',
        S3_SECRET_ACCESS_KEY: 'EXAMPLE_SECRET_ACCESS_KEY',
        S3_FORCE_PATH_STYLE: 'false',
      }),
    ).toThrow('Missing FFPROBE_PATH');
  });
});
