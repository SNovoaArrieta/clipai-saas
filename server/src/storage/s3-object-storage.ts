import {
  GetObjectCommand,
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
  type ConfirmedObject,
  type InspectUploadedObjectInput,
  type ObjectStorage,
  type ReadConfirmedObjectInput,
  type UploadTarget,
  type UploadedObjectMetadata,
} from './object-storage.js';

const OBJECT_STORAGE_HEAD_TIMEOUT_MILLISECONDS = 10_000;
const OBJECT_STORAGE_MAXIMUM_READ_TIMEOUT_MILLISECONDS = 300_000;
const STORAGE_REVISION_MAXIMUM_LENGTH = 1_024;

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
    const abortController = new AbortController();
    const timeout = createRequestTimeout(
      abortController,
      OBJECT_STORAGE_HEAD_TIMEOUT_MILLISECONDS,
    );

    try {
      const output = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: input.objectKey,
        }),
        { abortSignal: abortController.signal },
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
      const storageRevision = normalizeStorageRevision(output.VersionId);
      const metadata = normalizeMetadata(output.Metadata ?? {});

      return {
        sizeBytes: output.ContentLength,
        ...(contentType === undefined ? {} : { contentType }),
        ...(etag === undefined ? {} : { etag }),
        storageRevision,
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
    } finally {
      clearTimeout(timeout);
    }
  }

  public async readConfirmedObject(
    input: ReadConfirmedObjectInput,
  ): Promise<ConfirmedObject> {
    assertReadInput(input);

    const abortController = new AbortController();
    const timeout = createRequestTimeout(
      abortController,
      input.timeoutMilliseconds,
    );

    try {
      const output = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: input.objectKey,
          VersionId: input.storageRevision,
          Range: `bytes=0-${input.expectedSizeBytes - 1}`,
        }),
        { abortSignal: abortController.signal },
      );

      if (
        output.ContentLength !== input.expectedSizeBytes ||
        output.VersionId !== input.storageRevision
      ) {
        throw new ObjectStorageMetadataError();
      }

      if (!isAsyncByteIterable(output.Body)) {
        throw new ObjectStorageUnavailableError();
      }

      return {
        sizeBytes: output.ContentLength,
        body: normalizeBody(
          output.Body,
          input.expectedSizeBytes,
          input.maximumSizeBytes,
          abortController,
          timeout,
        ),
      };
    } catch (error: unknown) {
      clearTimeout(timeout);
      abortController.abort();

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

function assertReadInput(input: ReadConfirmedObjectInput): void {
  if (
    !Number.isSafeInteger(input.expectedSizeBytes) ||
    input.expectedSizeBytes < 1 ||
    !Number.isSafeInteger(input.maximumSizeBytes) ||
    input.maximumSizeBytes < 1 ||
    input.expectedSizeBytes > input.maximumSizeBytes ||
    !Number.isSafeInteger(input.timeoutMilliseconds) ||
    input.timeoutMilliseconds < 1 ||
    input.timeoutMilliseconds >
      OBJECT_STORAGE_MAXIMUM_READ_TIMEOUT_MILLISECONDS ||
    normalizeStorageRevision(input.storageRevision) !== input.storageRevision
  ) {
    throw new ObjectStorageMetadataError();
  }
}

function createRequestTimeout(
  abortController: AbortController,
  timeoutMilliseconds: number,
): NodeJS.Timeout {
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMilliseconds);
  timeout.unref();
  return timeout;
}

function normalizeStorageRevision(value: string | undefined): string {
  const normalized = normalizeOptionalValue(value, false);
  if (
    normalized === undefined ||
    normalized.length > STORAGE_REVISION_MAXIMUM_LENGTH
  ) {
    throw new ObjectStorageUnavailableError();
  }

  return normalized;
}

function isAsyncByteIterable(
  value: unknown,
): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  );
}

async function* normalizeBody(
  body: AsyncIterable<Uint8Array>,
  expectedSizeBytes: number,
  maximumSizeBytes: number,
  abortController: AbortController,
  timeout: NodeJS.Timeout,
): AsyncIterable<Uint8Array> {
  let observedSizeBytes = 0;

  try {
    for await (const chunk of body) {
      if (!(chunk instanceof Uint8Array)) {
        throw new ObjectStorageUnavailableError();
      }

      observedSizeBytes += chunk.byteLength;
      if (
        observedSizeBytes > maximumSizeBytes ||
        observedSizeBytes > expectedSizeBytes
      ) {
        throw new ObjectStorageUnavailableError();
      }

      yield chunk;
    }

    if (observedSizeBytes !== expectedSizeBytes) {
      throw new ObjectStorageUnavailableError();
    }
  } catch (error: unknown) {
    if (
      error instanceof ObjectStorageMetadataError ||
      error instanceof ObjectStorageUnavailableError
    ) {
      throw error;
    }

    if (isNotFoundError(error)) {
      throw new ObjectStorageNotFoundError();
    }

    throw new ObjectStorageUnavailableError();
  } finally {
    clearTimeout(timeout);
    abortController.abort();
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
    candidate.name === 'NoSuchVersion' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
