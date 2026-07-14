import { Router, type Request } from 'express';

import type { IdentityVerifier } from '../identity/identity-verifier.js';
import { requireAuthentication } from '../identity/require-authentication.js';
import {
  getRequestPrincipal,
  resolveRequestPrincipal,
} from '../principal/request-principal.js';
import type { IdentityProvisioner } from '../provisioning/identity-provisioner.js';
import { AppError } from '../shared/errors/app-error.js';
import {
  ObjectStorageUnavailableError,
  type ObjectStorage,
} from '../storage/object-storage.js';
import {
  UPLOAD_FILENAME_MAX_LENGTH,
  UPLOAD_MAX_SIZE_BYTES,
  UploadIdempotencyConflictError,
  UploadIntentNotFoundError,
  UploadMetadataMismatchError,
  UploadNotCompletedError,
  UploadPersistenceError,
  UploadProjectArchivedError,
  UploadProjectNotFoundError,
  type UploadIntentService,
} from '../uploads/upload-intent-service.js';

const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{16,255}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const controlCharacterPattern = /\p{Cc}/u;
const urlOrDrivePrefixPattern = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const allowedContentTypes = new Map([
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
]);

interface ParsedUploadInput {
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

function uploadInputError(): AppError {
  return new AppError(400, 'UPLOAD_INPUT_INVALID', 'Upload input is invalid.');
}

function uploadConfirmationError(): AppError {
  return new AppError(
    400,
    'UPLOAD_CONFIRMATION_INVALID',
    'Upload confirmation is invalid.',
  );
}

function parseConfirmationBody(body: unknown): void {
  if (body === undefined) {
    return;
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 0
  ) {
    throw uploadConfirmationError();
  }
}

function parseUploadInput(body: unknown): ParsedUploadInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw uploadInputError();
  }

  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).length !== 3 ||
    typeof input.filename !== 'string' ||
    typeof input.contentType !== 'string' ||
    typeof input.sizeBytes !== 'number'
  ) {
    throw uploadInputError();
  }

  const filename = input.filename.trim();
  if (
    filename.length === 0 ||
    [...filename].length > UPLOAD_FILENAME_MAX_LENGTH ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    urlOrDrivePrefixPattern.test(filename) ||
    controlCharacterPattern.test(filename)
  ) {
    throw uploadInputError();
  }

  const extensionIndex = filename.lastIndexOf('.');
  const extension =
    extensionIndex < 0 ? '' : filename.slice(extensionIndex).toLowerCase();
  if (allowedContentTypes.get(extension) !== input.contentType) {
    throw uploadInputError();
  }

  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > UPLOAD_MAX_SIZE_BYTES
  ) {
    throw uploadInputError();
  }

  return {
    filename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  };
}

function parseIdempotencyKey(request: Request): string {
  const values = request.headersDistinct['idempotency-key'];
  if (
    values === undefined ||
    values.length !== 1 ||
    !idempotencyKeyPattern.test(values[0] ?? '')
  ) {
    throw uploadInputError();
  }

  return values[0] as string;
}

function mapUploadError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof UploadProjectNotFoundError) {
    return new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  }

  if (error instanceof UploadProjectArchivedError) {
    return new AppError(409, 'PROJECT_ARCHIVED', 'Project is archived.');
  }

  if (error instanceof UploadIntentNotFoundError) {
    return new AppError(
      404,
      'UPLOAD_INTENT_NOT_FOUND',
      'Upload intent was not found.',
    );
  }

  if (error instanceof UploadNotCompletedError) {
    return new AppError(
      409,
      'UPLOAD_NOT_COMPLETED',
      'Upload has not been completed.',
    );
  }

  if (error instanceof UploadMetadataMismatchError) {
    return new AppError(
      409,
      'UPLOAD_METADATA_MISMATCH',
      'Uploaded object metadata does not match.',
    );
  }

  if (error instanceof UploadIdempotencyConflictError) {
    return new AppError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Idempotency-Key was already used for another request.',
    );
  }

  if (error instanceof ObjectStorageUnavailableError) {
    return new AppError(
      503,
      'STORAGE_UNAVAILABLE',
      'Object storage is temporarily unavailable.',
    );
  }

  if (
    error instanceof UploadPersistenceError &&
    error.failure === 'unavailable'
  ) {
    return new AppError(
      503,
      'PERSISTENCE_UNAVAILABLE',
      'Persistence is temporarily unavailable.',
    );
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
}

export function createUploadIntentsRouter(
  identityVerifier: IdentityVerifier | undefined,
  identityProvisioner: IdentityProvisioner | undefined,
  uploadIntentService: UploadIntentService | undefined,
  objectStorage: ObjectStorage | undefined,
) {
  const router = Router({ mergeParams: true });

  router.post(
    '/',
    requireAuthentication(identityVerifier),
    resolveRequestPrincipal(identityProvisioner),
    async (request, response, next) => {
      if (uploadIntentService === undefined) {
        next(
          new AppError(
            503,
            'PERSISTENCE_NOT_CONFIGURED',
            'Persistence is not available.',
          ),
        );
        return;
      }

      if (objectStorage === undefined) {
        next(
          new AppError(
            503,
            'STORAGE_NOT_CONFIGURED',
            'Object storage is not available.',
          ),
        );
        return;
      }

      try {
        const projectId = request.params.projectId;
        if (typeof projectId !== 'string' || !uuidPattern.test(projectId)) {
          throw new UploadProjectNotFoundError();
        }

        const principal = getRequestPrincipal(request);
        const input = parseUploadInput(request.body);
        const result = await uploadIntentService.createUploadIntent(
          {
            workspaceId: principal.workspace.id,
            projectId,
            ...input,
            idempotencyKey: parseIdempotencyKey(request),
          },
          objectStorage,
        );

        response.location(
          `/api/v1/projects/${projectId}/upload-intents/${result.upload.handle}`,
        );
        response.set('Cache-Control', 'no-store');
        if (result.replayed) {
          response.set('Idempotency-Replayed', 'true');
        }
        response.status(201).json({
          data: { source: result.source, upload: result.upload },
        });
      } catch (error: unknown) {
        next(mapUploadError(error));
      }
    },
  );

  router.post(
    '/:uploadHandle/confirm',
    requireAuthentication(identityVerifier),
    resolveRequestPrincipal(identityProvisioner),
    async (request, response, next) => {
      if (uploadIntentService === undefined) {
        next(
          new AppError(
            503,
            'PERSISTENCE_NOT_CONFIGURED',
            'Persistence is not available.',
          ),
        );
        return;
      }

      if (objectStorage === undefined) {
        next(
          new AppError(
            503,
            'STORAGE_NOT_CONFIGURED',
            'Object storage is not available.',
          ),
        );
        return;
      }

      try {
        const projectId = request.params.projectId;
        const uploadHandle = request.params.uploadHandle;
        if (
          typeof projectId !== 'string' ||
          !uuidPattern.test(projectId) ||
          typeof uploadHandle !== 'string' ||
          !uuidPattern.test(uploadHandle)
        ) {
          throw uploadConfirmationError();
        }

        parseConfirmationBody(request.body);
        const principal = getRequestPrincipal(request);
        const result = await uploadIntentService.confirmUploadIntent(
          {
            workspaceId: principal.workspace.id,
            projectId,
            uploadHandle,
          },
          objectStorage,
        );

        response.set('Cache-Control', 'no-store');
        if (result.replayed) {
          response.set('Upload-Confirmation-Replayed', 'true');
        }
        response.status(200).json({
          data: { source: result.source, upload: result.upload },
        });
      } catch (error: unknown) {
        next(mapUploadError(error));
      }
    },
  );

  return router;
}
