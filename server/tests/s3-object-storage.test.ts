import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';

describe('S3ObjectStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a short-lived private PUT target without contacting storage', async () => {
    const storage = new S3ObjectStorage({
      endpoint: 'https://storage.example.invalid',
      region: 'example-region-1',
      bucket: 'private-test-bucket',
      accessKeyId: 'SYNTHETIC_TEST_ACCESS_KEY',
      secretAccessKey: 'SYNTHETIC_TEST_SECRET_KEY',
      forcePathStyle: true,
    });
    const target = await storage.createUploadTarget({
      objectKey:
        'uploads/0144e07d-7f4b-4c3d-82df-6ad1d9fd3188/opaque-object.mp4',
      contentType: 'video/mp4',
      sizeBytes: 1_024,
      expiresAt: new Date('2026-07-13T18:10:00.000Z'),
    });
    const url = new URL(target.url);

    expect(target.method).toBe('PUT');
    expect(target.headers).toEqual({ 'Content-Type': 'video/mp4' });
    expect(target.expiresAt.toISOString()).toBe('2026-07-13T18:10:00.000Z');
    expect(url.origin).toBe('https://storage.example.invalid');
    expect(url.pathname).toContain('/private-test-bucket/uploads/');
    expect(url.pathname).toContain('/opaque-object.mp4');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'content-type',
    );
    expect(url.searchParams.get('X-Amz-Credential')).toContain(
      '/example-region-1/s3/aws4_request',
    );
    expect(target.url.toLowerCase()).not.toContain('acl=public');
  });
});
