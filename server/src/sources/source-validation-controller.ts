import type { RequestHandler } from 'express';

import type { MediaInspector } from '../media/media-inspector.js';
import { getRequestPrincipal } from '../principal/request-principal.js';
import { AppError } from '../shared/errors/app-error.js';
import type { ObjectStorage } from '../storage/object-storage.js';
import {
  SourceNotReadyForValidationError,
  SourceValidationInspectorUnavailableError,
  SourceValidationPersistenceError,
  SourceValidationProjectArchivedError,
  SourceValidationProjectNotFoundError,
  SourceValidationSourceNotFoundError,
  SourceValidationStorageUnavailableError,
  StorageRevisionUnavailableError,
} from './source-validation-errors.js';
import type { SourceValidationService } from './source-validation-service.js';
import {
  parseSourceValidationRequest,
  SourceValidationInputError,
} from './source-validation-validator.js';

function mapSourceValidationError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof SourceValidationInputError) {
    return new AppError(
      400,
      'SOURCE_VALIDATION_INPUT_INVALID',
      'Source validation input is invalid.',
    );
  }
  if (error instanceof SourceValidationProjectNotFoundError) {
    return new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  }
  if (error instanceof SourceValidationProjectArchivedError) {
    return new AppError(409, 'PROJECT_ARCHIVED', 'Project is archived.');
  }
  if (error instanceof SourceValidationSourceNotFoundError) {
    return new AppError(404, 'SOURCE_NOT_FOUND', 'Source was not found.');
  }
  if (error instanceof SourceNotReadyForValidationError) {
    return new AppError(
      409,
      'SOURCE_NOT_READY_FOR_VALIDATION',
      'Source is not ready for validation.',
    );
  }
  if (error instanceof StorageRevisionUnavailableError) {
    return new AppError(
      503,
      'STORAGE_REVISION_UNAVAILABLE',
      'The confirmed media revision is temporarily unavailable.',
    );
  }
  if (error instanceof SourceValidationStorageUnavailableError) {
    return new AppError(
      503,
      'OBJECT_STORAGE_UNAVAILABLE',
      'Object storage is temporarily unavailable.',
    );
  }
  if (error instanceof SourceValidationInspectorUnavailableError) {
    return new AppError(
      503,
      'MEDIA_INSPECTOR_UNAVAILABLE',
      'Media inspection is temporarily unavailable.',
    );
  }
  if (
    error instanceof SourceValidationPersistenceError &&
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

export function createValidateSourceController(
  sourceValidationService: SourceValidationService | undefined,
  objectStorage: ObjectStorage | undefined,
  mediaInspector: MediaInspector | undefined,
): RequestHandler {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store');

    if (sourceValidationService === undefined) {
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
    if (mediaInspector === undefined) {
      next(
        new AppError(
          503,
          'MEDIA_INSPECTOR_NOT_CONFIGURED',
          'Media inspection is not available.',
        ),
      );
      return;
    }

    try {
      const principal = getRequestPrincipal(request);
      const input = parseSourceValidationRequest(request);
      const result = await sourceValidationService.validateSource(
        {
          workspaceId: principal.workspace.id,
          ...input,
        },
        objectStorage,
        mediaInspector,
      );
      if (result.replayed) {
        response.set('Source-Validation-Replayed', 'true');
      }
      response.status(200).json({ data: result.source });
    } catch (error: unknown) {
      next(mapSourceValidationError(error));
    }
  };
}
