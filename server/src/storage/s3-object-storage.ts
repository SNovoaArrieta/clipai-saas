import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  ObjectStorageUnavailableError,
  type CreateUploadTargetInput,
  type ObjectStorage,
  type UploadTarget,
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
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(['content-type']),
      });

      return {
        method: 'PUT',
        url,
        headers: { 'Content-Type': input.contentType },
        expiresAt: input.expiresAt,
      };
    } catch {
      throw new ObjectStorageUnavailableError();
    }
  }
}
