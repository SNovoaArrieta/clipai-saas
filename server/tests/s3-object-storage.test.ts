import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ObjectStorageMetadataError,
  ObjectStorageNotFoundError,
  ObjectStorageUnavailableError,
} from '../src/storage/object-storage.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';

const config = {
  endpoint: 'https://storage.example.invalid',
  region: 'example-region-1',
  bucket: 'private-test-bucket',
  accessKeyId: 'SYNTHETIC_TEST_ACCESS_KEY',
  secretAccessKey: 'SYNTHETIC_TEST_SECRET_KEY',
  forcePathStyle: true,
};

describe('S3ObjectStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates a short-lived private PUT target without contacting storage', async () => {
    const storage = new S3ObjectStorage(config);
    const target = await storage.createUploadTarget({
      uploadIntentId: '0144e07d-7f4b-4c3d-82df-6ad1d9fd3188',
      objectKey:
        'uploads/0144e07d-7f4b-4c3d-82df-6ad1d9fd3188/opaque-object.mp4',
      contentType: 'video/mp4',
      sizeBytes: 1_024,
      expiresAt: new Date('2026-07-13T18:10:00.000Z'),
    });
    const url = new URL(target.url);

    expect(target.method).toBe('PUT');
    expect(target.headers).toEqual({
      'Content-Type': 'video/mp4',
      'x-amz-meta-upload-intent-id': '0144e07d-7f4b-4c3d-82df-6ad1d9fd3188',
    });
    expect(target.expiresAt.toISOString()).toBe('2026-07-13T18:10:00.000Z');
    expect(url.origin).toBe('https://storage.example.invalid');
    expect(url.pathname).toContain('/private-test-bucket/uploads/');
    expect(url.pathname).toContain('/opaque-object.mp4');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'content-type',
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'x-amz-meta-upload-intent-id',
    );
    expect(url.searchParams.has('x-amz-meta-upload-intent-id')).toBe(false);
    expect(url.searchParams.get('X-Amz-Credential')).toContain(
      '/example-region-1/s3/aws4_request',
    );
    expect(target.url.toLowerCase()).not.toContain('acl=public');
  });

  it('inspects only the persisted private object key with HEAD', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentLength: 1_024,
      ContentType: ' Video/MP4 ',
      ETag: ' "opaque-etag" ',
      VersionId: 'opaque-version-1',
      Metadata: {
        'upload-intent-id': '0144e07d-7f4b-4c3d-82df-6ad1d9fd3188',
        Extra: ' value ',
      },
    } as never);
    const storage = new S3ObjectStorage(config);

    const result = await storage.inspectUploadedObject({
      objectKey:
        'uploads/0144e07d-7f4b-4c3d-82df-6ad1d9fd3188/opaque-object.mp4',
    });

    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect((command as HeadObjectCommand).input).toEqual({
      Bucket: 'private-test-bucket',
      Key: 'uploads/0144e07d-7f4b-4c3d-82df-6ad1d9fd3188/opaque-object.mp4',
    });
    expect(result).toEqual({
      sizeBytes: 1_024,
      contentType: 'video/mp4',
      etag: '"opaque-etag"',
      storageRevision: 'opaque-version-1',
      metadata: {
        'upload-intent-id': '0144e07d-7f4b-4c3d-82df-6ad1d9fd3188',
        extra: 'value',
      },
    });
  });

  it('classifies a missing object without exposing provider details', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    });

    await expect(
      new S3ObjectStorage(config).inspectUploadedObject({
        objectKey: 'uploads/private/missing.mp4',
      }),
    ).rejects.toBeInstanceOf(ObjectStorageNotFoundError);
  });

  it('rejects unusable observed metadata', async () => {
    vi.spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        ContentType: 'video/mp4',
        VersionId: 'opaque-version-1',
        Metadata: {},
      } as never)
      .mockResolvedValueOnce({
        ContentLength: 1_024,
        ContentType: 'video/mp4',
        VersionId: 'opaque-version-1',
        Metadata: {
          'upload-intent-id': 'first',
          'Upload-Intent-Id': 'ambiguous',
        },
      } as never);
    const storage = new S3ObjectStorage(config);

    await expect(
      storage.inspectUploadedObject({
        objectKey: 'uploads/private/invalid.mp4',
      }),
    ).rejects.toBeInstanceOf(ObjectStorageMetadataError);
    await expect(
      storage.inspectUploadedObject({
        objectKey: 'uploads/private/ambiguous.mp4',
      }),
    ).rejects.toBeInstanceOf(ObjectStorageMetadataError);
  });

  it('classifies other HEAD failures as storage unavailable', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue({
      name: 'ServiceUnavailable',
      $metadata: { httpStatusCode: 503 },
    });

    await expect(
      new S3ObjectStorage(config).inspectUploadedObject({
        objectKey: 'uploads/private/unavailable.mp4',
      }),
    ).rejects.toBeInstanceOf(ObjectStorageUnavailableError);
  });

  it('requires a provider revision before confirmation can complete', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentLength: 1_024,
      ContentType: 'video/mp4',
      Metadata: {},
    } as never);

    await expect(
      new S3ObjectStorage(config).inspectUploadedObject({
        objectKey: 'uploads/private/unversioned.mp4',
      }),
    ).rejects.toBeInstanceOf(ObjectStorageUnavailableError);
  });

  it('reads only the confirmed immutable revision with a bounded range', async () => {
    const body = (async function* () {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3, 4]);
    })();
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentLength: 4,
      VersionId: 'opaque-version-1',
      Body: body,
    } as never);
    const storage = new S3ObjectStorage(config);

    const confirmed = await storage.readConfirmedObject({
      objectKey: 'uploads/private/media.mp4',
      storageRevision: 'opaque-version-1',
      expectedSizeBytes: 4,
      maximumSizeBytes: 10,
      timeoutMilliseconds: 5_000,
    });
    const chunks: number[] = [];
    for await (const chunk of confirmed.body) {
      chunks.push(...chunk);
    }

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input).toEqual({
      Bucket: 'private-test-bucket',
      Key: 'uploads/private/media.mp4',
      VersionId: 'opaque-version-1',
      Range: 'bytes=0-3',
    });
    expect(confirmed.sizeBytes).toBe(4);
    expect(chunks).toEqual([1, 2, 3, 4]);
  });

  it('distinguishes an absent confirmed revision from storage unavailability', async () => {
    vi.spyOn(S3Client.prototype, 'send')
      .mockRejectedValueOnce({
        name: 'NoSuchVersion',
        $metadata: { httpStatusCode: 404 },
      })
      .mockRejectedValueOnce({
        name: 'ServiceUnavailable',
        $metadata: { httpStatusCode: 503 },
      });
    const storage = new S3ObjectStorage(config);
    const input = {
      objectKey: 'uploads/private/media.mp4',
      storageRevision: 'opaque-version-1',
      expectedSizeBytes: 4,
      maximumSizeBytes: 10,
      timeoutMilliseconds: 5_000,
    };

    await expect(storage.readConfirmedObject(input)).rejects.toBeInstanceOf(
      ObjectStorageNotFoundError,
    );
    await expect(storage.readConfirmedObject(input)).rejects.toBeInstanceOf(
      ObjectStorageUnavailableError,
    );
  });

  it('rejects a provider response for a different revision as metadata mismatch', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentLength: 4,
      VersionId: 'different-provider-version',
      Body: (async function* () {
        yield new Uint8Array([1, 2, 3, 4]);
      })(),
    } as never);

    await expect(
      new S3ObjectStorage(config).readConfirmedObject({
        objectKey: 'uploads/private/media.mp4',
        storageRevision: 'opaque-version-1',
        expectedSizeBytes: 4,
        maximumSizeBytes: 10,
        timeoutMilliseconds: 5_000,
      }),
    ).rejects.toBeInstanceOf(ObjectStorageMetadataError);
  });

  it('rejects truncated streams and requests above the caller limit', async () => {
    const body = (async function* () {
      yield new Uint8Array([1, 2]);
    })();
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentLength: 4,
      VersionId: 'opaque-version-1',
      Body: body,
    } as never);
    const storage = new S3ObjectStorage(config);
    const confirmed = await storage.readConfirmedObject({
      objectKey: 'uploads/private/media.mp4',
      storageRevision: 'opaque-version-1',
      expectedSizeBytes: 4,
      maximumSizeBytes: 4,
      timeoutMilliseconds: 5_000,
    });

    await expect(async () => {
      for await (const chunk of confirmed.body) {
        // Consume the complete provider stream to trigger final size validation.
        void chunk;
      }
    }).rejects.toBeInstanceOf(ObjectStorageUnavailableError);
    await expect(
      storage.readConfirmedObject({
        objectKey: 'uploads/private/media.mp4',
        storageRevision: 'opaque-version-1',
        expectedSizeBytes: 5,
        maximumSizeBytes: 4,
        timeoutMilliseconds: 5_000,
      }),
    ).rejects.toBeInstanceOf(ObjectStorageMetadataError);
  });
});
