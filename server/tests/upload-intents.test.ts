import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../src/app.js';
import type { IdentityVerifier } from '../src/identity/identity-verifier.js';
import type { IdentityProvisioner } from '../src/provisioning/identity-provisioner.js';
import {
  ObjectStorageUnavailableError,
  type ObjectStorage,
} from '../src/storage/object-storage.js';
import {
  UploadIdempotencyConflictError,
  UploadPersistenceError,
  UploadProjectArchivedError,
  UploadProjectNotFoundError,
  type UploadIntentService,
} from '../src/uploads/upload-intent-service.js';

const userId = '0a2ae619-85a6-4571-bccd-3e882cbd2fc8';
const workspaceId = '3ad971a4-79a2-4a3a-9d15-0c9220d31955';
const projectId = '9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482';
const sourceId = '87c00c7d-d959-46f1-a760-e067a42ae525';
const uploadIntentId = '0144e07d-7f4b-4c3d-82df-6ad1d9fd3188';
const authorization = 'Bearer verified-upload-token';
const idempotencyKey = 'upload-intent-key-0001';
const signedUrl = 'https://storage.example.invalid/synthetic-signed-target';

const validBody = {
  filename: 'Episodio 01.mp4',
  contentType: 'video/mp4',
  sizeBytes: 52_428_800,
};

function createObjectStorage(): ObjectStorage {
  return {
    createUploadTarget: vi.fn(async (input) => ({
      method: 'PUT' as const,
      url: signedUrl,
      headers: { 'Content-Type': input.contentType },
      expiresAt: input.expiresAt,
    })),
  };
}

function createUploadIntentService(
  overrides: Partial<UploadIntentService> = {},
): UploadIntentService {
  return {
    createUploadIntent: vi.fn(async (input, objectStorage) => {
      const target = await objectStorage.createUploadTarget({
        objectKey: `uploads/${uploadIntentId}/opaque.mp4`,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        expiresAt: new Date('2026-07-13T18:10:00.000Z'),
      });

      return {
        source: {
          id: sourceId,
          sourceType: 'upload' as const,
          state: 'submitted' as const,
          safeReference: input.filename,
          durationMs: null,
          isActive: false as const,
          createdAt: '2026-07-13T18:00:00.000Z',
          updatedAt: '2026-07-13T18:00:00.000Z',
        },
        upload: {
          handle: uploadIntentId,
          method: target.method,
          url: target.url,
          headers: target.headers,
          expiresAt: target.expiresAt.toISOString(),
          maxSizeBytes: 262_144_000,
        },
        replayed: false,
      };
    }),
    ...overrides,
  };
}

function createDependencies(
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
      user: { id: userId, email: 'private@example.com' },
      workspace: { id: workspaceId },
    })),
  };

  return {
    identityVerifier,
    identityProvisioner,
    uploadIntentService: createUploadIntentService(),
    objectStorage: createObjectStorage(),
    ...overrides,
  };
}

function postUpload(dependencies: AppDependencies, body: unknown = validBody) {
  return request(createApp(dependencies))
    .post(`/api/v1/projects/${projectId}/upload-intents`)
    .set('Authorization', authorization)
    .set('Idempotency-Key', idempotencyKey)
    .send(body as object);
}

describe('private upload intent route', () => {
  it.each([
    ['clip.mp4', 'video/mp4'],
    ['clip.MOV', 'video/quicktime'],
    ['audio.mp3', 'audio/mpeg'],
    ['audio.wav', 'audio/wav'],
  ])('accepts a valid %s declaration', async (filename, contentType) => {
    const uploadIntentService = createUploadIntentService();
    const response = await postUpload(
      createDependencies({ uploadIntentService }),
      { filename, contentType, sizeBytes: 1 },
    );

    expect(response.status).toBe(201);
    expect(uploadIntentService.createUploadIntent).toHaveBeenCalledWith(
      {
        workspaceId,
        projectId,
        filename,
        contentType,
        sizeBytes: 1,
        idempotencyKey,
      },
      expect.any(Object),
    );
  });

  it.each([
    [{ ...validBody, filename: 'clip.avi' }],
    [{ ...validBody, contentType: 'audio/mpeg' }],
    [{ ...validBody, filename: '' }],
    [{ ...validBody, filename: '../clip.mp4' }],
    [{ ...validBody, filename: 'folder/clip.mp4' }],
    [{ ...validBody, filename: 'folder\\clip.mp4' }],
    [{ ...validBody, filename: 'clip\u0000.mp4' }],
    [{ ...validBody, sizeBytes: 0 }],
    [{ ...validBody, sizeBytes: 262_144_001 }],
    [{ ...validBody, sizeBytes: 1.5 }],
    [{ ...validBody, workspaceId }],
    [{ ...validBody, objectKey: 'client-controlled' }],
  ])('rejects invalid or server-controlled input %#', async (body) => {
    const response = await postUpload(createDependencies(), body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UPLOAD_INPUT_INVALID');
  });

  it('normalizes exterior whitespace and rejects URL-like filenames', async () => {
    const uploadIntentService = createUploadIntentService();
    const response = await postUpload(
      createDependencies({ uploadIntentService }),
      { ...validBody, filename: '  Episodio 01.mp4  ' },
    );

    expect(response.status).toBe(201);
    expect(uploadIntentService.createUploadIntent).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Episodio 01.mp4' }),
      expect.any(Object),
    );

    const urlLike = await postUpload(createDependencies(), {
      ...validBody,
      filename: 'https:private.example.mp4',
    });
    expect(urlLike.status).toBe(400);
    expect(urlLike.body.error.code).toBe('UPLOAD_INPUT_INVALID');
  });

  it('rejects a missing or invalid Idempotency-Key', async () => {
    const app = createApp(createDependencies());
    const missing = await request(app)
      .post(`/api/v1/projects/${projectId}/upload-intents`)
      .set('Authorization', authorization)
      .send(validBody);
    const invalid = await request(app)
      .post(`/api/v1/projects/${projectId}/upload-intents`)
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'short')
      .send(validBody);

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(missing.body.error.code).toBe('UPLOAD_INPUT_INVALID');
    expect(invalid.body.error.code).toBe('UPLOAD_INPUT_INVALID');
  });

  it('returns only the upload data needed by the client', async () => {
    const response = await postUpload(createDependencies());
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.source).toMatchObject({
      sourceType: 'upload',
      state: 'submitted',
      isActive: false,
      durationMs: null,
    });
    expect(response.body.data.upload).toMatchObject({
      handle: uploadIntentId,
      method: 'PUT',
      url: signedUrl,
      headers: { 'Content-Type': 'video/mp4' },
      maxSizeBytes: 262_144_000,
    });
    for (const privateField of [
      'workspaceId',
      'projectId',
      'objectKey',
      'authSubject',
      'idempotencyKey',
      'accessKey',
      'secret',
      'bucket',
    ]) {
      expect(serialized).not.toContain(privateField);
    }
  });

  it('marks a replay while preserving Source and upload handle', async () => {
    const uploadIntentService = createUploadIntentService({
      createUploadIntent: vi.fn(async () => ({
        source: {
          id: sourceId,
          sourceType: 'upload' as const,
          state: 'submitted' as const,
          safeReference: validBody.filename,
          durationMs: null,
          isActive: false as const,
          createdAt: '2026-07-13T18:00:00.000Z',
          updatedAt: '2026-07-13T18:00:00.000Z',
        },
        upload: {
          handle: uploadIntentId,
          method: 'PUT' as const,
          url: `${signedUrl}?renewed=true`,
          headers: { 'Content-Type': validBody.contentType },
          expiresAt: '2026-07-13T18:20:00.000Z',
          maxSizeBytes: 262_144_000,
        },
        replayed: true as const,
      })),
    });
    const response = await postUpload(
      createDependencies({ uploadIntentService }),
    );

    expect(response.status).toBe(201);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(response.body.data.source.id).toBe(sourceId);
    expect(response.body.data.upload.handle).toBe(uploadIntentId);
  });

  it.each([
    [new UploadProjectNotFoundError(), 404, 'PROJECT_NOT_FOUND'],
    [new UploadProjectArchivedError(), 409, 'PROJECT_ARCHIVED'],
    [new UploadIdempotencyConflictError(), 409, 'IDEMPOTENCY_CONFLICT'],
    [new ObjectStorageUnavailableError(), 503, 'STORAGE_UNAVAILABLE'],
    [new UploadPersistenceError('unavailable'), 503, 'PERSISTENCE_UNAVAILABLE'],
    [new UploadPersistenceError('internal'), 500, 'INTERNAL_ERROR'],
    [new Error('private sdk detail'), 500, 'INTERNAL_ERROR'],
  ])('maps a controlled domain failure to %s', async (error, status, code) => {
    const uploadIntentService = createUploadIntentService({
      createUploadIntent: vi.fn(async () => {
        throw error;
      }),
    });
    const response = await postUpload(
      createDependencies({ uploadIntentService }),
    );

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(JSON.stringify(response.body)).not.toContain('private sdk detail');
    expect(JSON.stringify(response.body)).not.toContain(signedUrl);
  });

  it('returns STORAGE_NOT_CONFIGURED without invoking persistence', async () => {
    const uploadIntentService = createUploadIntentService();
    const { objectStorage: omittedStorage, ...dependencies } =
      createDependencies({ uploadIntentService });
    void omittedStorage;
    const response = await postUpload(dependencies);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
    expect(uploadIntentService.createUploadIntent).not.toHaveBeenCalled();
  });

  it('returns PERSISTENCE_NOT_CONFIGURED before storage work', async () => {
    const objectStorage = createObjectStorage();
    const { uploadIntentService: omittedService, ...dependencies } =
      createDependencies({ objectStorage });
    void omittedService;
    const response = await postUpload(dependencies);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PERSISTENCE_NOT_CONFIGURED');
    expect(objectStorage.createUploadTarget).not.toHaveBeenCalled();
  });

  it('requires authentication and preserves a public health route', async () => {
    const app = createApp(createDependencies());
    const unauthorized = await request(app)
      .post(`/api/v1/projects/${projectId}/upload-intents`)
      .set('Idempotency-Key', idempotencyKey)
      .send(validBody);
    const health = await request(app).get('/health');

    expect(unauthorized.status).toBe(401);
    expect(health.status).toBe(200);
  });

  it('sanitizes malformed JSON as upload input', async () => {
    const response = await request(createApp(createDependencies()))
      .post(`/api/v1/projects/${projectId}/upload-intents`)
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UPLOAD_INPUT_INVALID');
  });
});
