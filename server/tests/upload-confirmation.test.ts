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
  UploadIntentNotFoundError,
  UploadMetadataMismatchError,
  UploadNotCompletedError,
  UploadPersistenceError,
  UploadProjectArchivedError,
  type UploadIntentService,
} from '../src/uploads/upload-intent-service.js';

const workspaceId = '3ad971a4-79a2-4a3a-9d15-0c9220d31955';
const projectId = '9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482';
const uploadHandle = '0144e07d-7f4b-4c3d-82df-6ad1d9fd3188';
const sourceId = '87c00c7d-d959-46f1-a760-e067a42ae525';

function createService(
  overrides: Partial<UploadIntentService> = {},
): UploadIntentService {
  return {
    createUploadIntent: vi.fn(async () => {
      throw new Error('Unexpected upload-intent creation.');
    }),
    confirmUploadIntent: vi.fn(async () => ({
      source: {
        id: sourceId,
        sourceType: 'upload' as const,
        state: 'validating' as const,
        safeReference: 'episode.mp4',
        durationMs: null,
        isActive: false as const,
        createdAt: '2026-07-13T22:00:00.000Z',
        updatedAt: '2026-07-13T22:05:00.000Z',
      },
      upload: {
        handle: uploadHandle,
        status: 'completed' as const,
        sizeBytes: 1_024,
        contentType: 'video/mp4',
        completedAt: '2026-07-13T22:05:00.000Z',
      },
      replayed: false,
    })),
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
      user: {
        id: '0a2ae619-85a6-4571-bccd-3e882cbd2fc8',
        email: 'private@example.com',
      },
      workspace: { id: workspaceId },
    })),
  };
  const objectStorage: ObjectStorage = {
    createUploadTarget: vi.fn(async () => {
      throw new Error('Unexpected upload target creation.');
    }),
    inspectUploadedObject: vi.fn(async () => {
      throw new Error('Unexpected direct object inspection.');
    }),
  };

  return {
    identityVerifier,
    identityProvisioner,
    uploadIntentService: createService(),
    objectStorage,
    ...overrides,
  };
}

function confirmUpload(dependencies: AppDependencies, body?: unknown) {
  const call = request(createApp(dependencies))
    .post(
      `/api/v1/projects/${projectId}/upload-intents/${uploadHandle}/confirm`,
    )
    .set('Authorization', 'Bearer verified-upload-token');
  return body === undefined ? call : call.send(body as object);
}

describe('private upload confirmation route', () => {
  it('returns a safe validating Source without storage internals', async () => {
    const service = createService();
    const dependencies = createDependencies({ uploadIntentService: service });

    const response = await confirmUpload(dependencies, {});

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      data: {
        source: expect.objectContaining({
          id: sourceId,
          state: 'validating',
          durationMs: null,
          isActive: false,
        }),
        upload: {
          handle: uploadHandle,
          status: 'completed',
          sizeBytes: 1_024,
          contentType: 'video/mp4',
          completedAt: '2026-07-13T22:05:00.000Z',
        },
      },
    });
    expect(typeof response.body.data.upload.sizeBytes).toBe('number');
    expect(response.body.data.upload.sizeBytes).toBeLessThanOrEqual(
      262_144_000,
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /etag|bucket|objectKey|credential|signed/i,
    );
    expect(service.confirmUploadIntent).toHaveBeenCalledWith(
      { workspaceId, projectId, uploadHandle },
      dependencies.objectStorage,
    );
  });

  it('marks an already-completed confirmation replay', async () => {
    const service = createService({
      confirmUploadIntent: vi.fn(async () => ({
        source: {
          id: sourceId,
          sourceType: 'upload' as const,
          state: 'validating' as const,
          safeReference: 'episode.mp4',
          durationMs: null,
          isActive: false as const,
          createdAt: '2026-07-13T22:00:00.000Z',
          updatedAt: '2026-07-13T22:05:00.000Z',
        },
        upload: {
          handle: uploadHandle,
          status: 'completed' as const,
          sizeBytes: 1_024,
          contentType: 'video/mp4',
          completedAt: '2026-07-13T22:05:00.000Z',
        },
        replayed: true,
      })),
    });

    const response = await confirmUpload(
      createDependencies({ uploadIntentService: service }),
    );

    expect(response.status).toBe(200);
    expect(response.headers['upload-confirmation-replayed']).toBe('true');
  });

  it.each([
    [new UploadIntentNotFoundError(), 404, 'UPLOAD_INTENT_NOT_FOUND'],
    [new UploadNotCompletedError(), 409, 'UPLOAD_NOT_COMPLETED'],
    [new UploadMetadataMismatchError(), 409, 'UPLOAD_METADATA_MISMATCH'],
    [new UploadProjectArchivedError(), 409, 'PROJECT_ARCHIVED'],
    [new ObjectStorageUnavailableError(), 503, 'STORAGE_UNAVAILABLE'],
    [new UploadPersistenceError('unavailable'), 503, 'PERSISTENCE_UNAVAILABLE'],
  ])('maps a domain failure safely', async (error, status, code) => {
    const service = createService({
      confirmUploadIntent: vi.fn(async () => {
        throw error;
      }),
    });

    const response = await confirmUpload(
      createDependencies({ uploadIntentService: service }),
    );

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(JSON.stringify(response.body)).not.toMatch(
      /bucket|objectKey|stack/i,
    );
  });

  it.each([
    [`/api/v1/projects/not-a-uuid/upload-intents/${uploadHandle}/confirm`, {}],
    [`/api/v1/projects/${projectId}/upload-intents/not-a-uuid/confirm`, {}],
    [
      `/api/v1/projects/${projectId}/upload-intents/${uploadHandle}/confirm`,
      {
        objectKey: 'forbidden',
        bucket: 'forbidden',
        url: 'https://forbidden.invalid',
        etag: 'forbidden',
        metadata: {},
        sizeBytes: 1,
        contentType: 'video/mp4',
        workspaceId,
        sourceId,
      },
    ],
  ])('rejects invalid parameters and non-empty bodies', async (path, body) => {
    const response = await request(createApp(createDependencies()))
      .post(path)
      .set('Authorization', 'Bearer verified-upload-token')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UPLOAD_CONFIRMATION_INVALID');
  });

  it('uses the confirmation-specific error for malformed JSON', async () => {
    const response = await request(createApp(createDependencies()))
      .post(
        `/api/v1/projects/${projectId}/upload-intents/${uploadHandle}/confirm`,
      )
      .set('Authorization', 'Bearer verified-upload-token')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UPLOAD_CONFIRMATION_INVALID');
  });

  it('requires authentication before exposing intent visibility', async () => {
    const response = await request(createApp(createDependencies())).post(
      `/api/v1/projects/${projectId}/upload-intents/${uploadHandle}/confirm`,
    );

    expect(response.status).toBe(401);
  });

  it('reports persistence that is not configured', async () => {
    const { uploadIntentService: omitted, ...dependencies } =
      createDependencies();
    void omitted;

    const response = await confirmUpload(dependencies);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PERSISTENCE_NOT_CONFIGURED');
  });

  it('reports object storage that is not configured', async () => {
    const { objectStorage: omitted, ...dependencies } = createDependencies();
    void omitted;

    const response = await confirmUpload(dependencies);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
  });
});
