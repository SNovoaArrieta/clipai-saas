export interface CreateUploadTargetInput {
  readonly objectKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly expiresAt: Date;
}

export interface UploadTarget {
  readonly method: 'PUT';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface ObjectStorage {
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>;
}

export class ObjectStorageUnavailableError extends Error {
  public constructor() {
    super('Object storage is unavailable.');
    this.name = 'ObjectStorageUnavailableError';
  }
}
