import type { ObjectStorage, UploadTarget } from '../storage/object-storage.js';

export const UPLOAD_MAX_SIZE_BYTES = 262_144_000;
export const UPLOAD_FILENAME_MAX_LENGTH = 255;
export const UPLOAD_TARGET_TTL_MILLISECONDS = 10 * 60 * 1_000;

export interface UploadSourceView {
  readonly id: string;
  readonly sourceType: 'upload';
  readonly state: 'submitted';
  readonly safeReference: string;
  readonly durationMs: null;
  readonly isActive: false;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UploadIntentView {
  readonly handle: string;
  readonly method: 'PUT';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: string;
  readonly maxSizeBytes: number;
}

export interface CreateUploadIntentInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly idempotencyKey: string;
}

export interface CreateUploadIntentResult {
  readonly source: UploadSourceView;
  readonly upload: UploadIntentView;
  readonly replayed: boolean;
}

export interface ConfirmedUploadSourceView {
  readonly id: string;
  readonly sourceType: 'upload';
  readonly state: 'validating';
  readonly safeReference: string;
  readonly durationMs: null;
  readonly isActive: false;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConfirmedUploadView {
  readonly handle: string;
  readonly status: 'completed';
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly completedAt: string;
}

export interface ConfirmUploadIntentInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly uploadHandle: string;
}

export interface ConfirmUploadIntentResult {
  readonly source: ConfirmedUploadSourceView;
  readonly upload: ConfirmedUploadView;
  readonly replayed: boolean;
}

export interface UploadIntentService {
  createUploadIntent(
    input: CreateUploadIntentInput,
    objectStorage: ObjectStorage,
  ): Promise<CreateUploadIntentResult>;
  confirmUploadIntent(
    input: ConfirmUploadIntentInput,
    objectStorage: ObjectStorage,
  ): Promise<ConfirmUploadIntentResult>;
}

export class UploadProjectNotFoundError extends Error {
  public constructor() {
    super('Project was not found.');
    this.name = 'UploadProjectNotFoundError';
  }
}

export class UploadProjectArchivedError extends Error {
  public constructor() {
    super('Project is archived.');
    this.name = 'UploadProjectArchivedError';
  }
}

export class UploadIdempotencyConflictError extends Error {
  public constructor() {
    super('Upload idempotency conflict.');
    this.name = 'UploadIdempotencyConflictError';
  }
}

export class UploadIntentNotFoundError extends Error {
  public constructor() {
    super('Upload intent was not found.');
    this.name = 'UploadIntentNotFoundError';
  }
}

export class UploadNotCompletedError extends Error {
  public constructor() {
    super('Upload has not been completed.');
    this.name = 'UploadNotCompletedError';
  }
}

export class UploadMetadataMismatchError extends Error {
  public constructor() {
    super('Uploaded object metadata does not match.');
    this.name = 'UploadMetadataMismatchError';
  }
}

export type UploadPersistenceFailure = 'unavailable' | 'internal';

export class UploadPersistenceError extends Error {
  public constructor(public readonly failure: UploadPersistenceFailure) {
    super('Upload persistence failed.');
    this.name = 'UploadPersistenceError';
  }
}

export function toUploadIntentView(
  handle: string,
  target: UploadTarget,
): UploadIntentView {
  return {
    handle,
    method: target.method,
    url: target.url,
    headers: target.headers,
    expiresAt: target.expiresAt.toISOString(),
    maxSizeBytes: UPLOAD_MAX_SIZE_BYTES,
  };
}
