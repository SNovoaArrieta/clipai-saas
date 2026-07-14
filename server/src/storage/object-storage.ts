export interface CreateUploadTargetInput {
  readonly objectKey: string;
  readonly uploadIntentId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly expiresAt: Date;
}

export interface InspectUploadedObjectInput {
  readonly objectKey: string;
}

export interface UploadedObjectMetadata {
  readonly sizeBytes: number;
  readonly contentType?: string;
  readonly etag?: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface UploadTarget {
  readonly method: 'PUT';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface ObjectStorage {
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>;
  inspectUploadedObject(
    input: InspectUploadedObjectInput,
  ): Promise<UploadedObjectMetadata>;
}

export class ObjectStorageNotFoundError extends Error {
  public constructor() {
    super('Uploaded object was not found.');
    this.name = 'ObjectStorageNotFoundError';
  }
}

export class ObjectStorageMetadataError extends Error {
  public constructor() {
    super('Uploaded object metadata is invalid.');
    this.name = 'ObjectStorageMetadataError';
  }
}

export class ObjectStorageUnavailableError extends Error {
  public constructor() {
    super('Object storage is unavailable.');
    this.name = 'ObjectStorageUnavailableError';
  }
}
