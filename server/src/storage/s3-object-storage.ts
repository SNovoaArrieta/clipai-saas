import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  ObjectStorageMetadataError,
  ObjectStorageNotFoundError,
  ObjectStorageUnavailableError,
  type CreateUploadTargetInput,
  type InspectUploadedObjectInput,
  type ObjectStorage,
  type UploadTarget,
  type UploadedObjectMetadata,
} from './object-storage.js';

export interface S3ObjectStorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  public constructor(private readonly config: S3ObjectStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  public async createUploadTarget(
    input: CreateUploadTargetInput,
  ): Promise<UploadTarget> {
    const expiresInSeconds = Math.max(
      1,
      Math.ceil((input.expiresAt.getTime() - Date.now()) / 1_000),
    );

    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
        Metadata: { 'upload-intent-id': input.uploadIntentId },
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set(['x-amz-meta-upload-intent-id']),
      });

      return {
        method: 'PUT',
        url,
        headers: {
          'Content-Type': input.contentType,
          'x-amz-meta-upload-intent-id': input.uploadIntentId,
        },
        expiresAt: input.expiresAt,
      };
    } catch {
      throw new ObjectStorageUnavailableError();
    }
  }

  public async inspectUploadedObject(
    input: InspectUploadedObjectInput,
  ): Promise<UploadedObjectMetadata> {
    try {
      const output = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: input.objectKey,
        }),
      );

      if (
        output.ContentLength === undefined ||
        !Number.isSafeInteger(output.ContentLength) ||
        output.ContentLength < 0
      ) {
        throw new ObjectStorageMetadataError();
      }

      const contentType = normalizeOptionalValue(output.ContentType, true);
      const etag = normalizeOptionalValue(output.ETag, false);
      const metadata = normalizeMetadata(output.Metadata ?? {});

      return {
        sizeBytes: output.ContentLength,
        ...(contentType === undefined ? {} : { contentType }),
        ...(etag === undefined ? {} : { etag }),
        metadata,
      };
    } catch (error: unknown) {
      if (error instanceof ObjectStorageMetadataError) {
        throw error;
      }

      if (isNotFoundError(error)) {
        throw new ObjectStorageNotFoundError();
      }

      throw new ObjectStorageUnavailableError();
    }
  }
}

function normalizeMetadata(
  metadata: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.toLowerCase();
    if (
      value === undefined ||
      Object.prototype.hasOwnProperty.call(normalized, normalizedKey)
    ) {
      throw new ObjectStorageMetadataError();
    }

    normalized[normalizedKey] = value.trim();
  }

  return normalized;
}

function normalizeOptionalValue(
  value: string | undefined,
  lowercase: boolean,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return lowercase ? normalized.toLowerCase() : normalized;
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {
    readonly name?: unknown;
    readonly $metadata?: { readonly httpStatusCode?: unknown };
  };
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
