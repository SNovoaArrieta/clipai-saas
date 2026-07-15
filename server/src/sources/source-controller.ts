import type { RequestHandler } from 'express';

import { getRequestPrincipal } from '../principal/request-principal.js';
import { AppError } from '../shared/errors/app-error.js';
import {
  SourcePersistenceError,
  SourceProjectArchivedError,
  SourceProjectNotFoundError,
  SourceQueryError,
  type SourceService,
} from './source-service.js';
import {
  parseSourceListRequest,
  SourceProjectIdValidationError,
  SourceQueryValidationError,
} from './source-query-validator.js';

function sourceQueryError(): AppError {
  return new AppError(400, 'SOURCE_QUERY_INVALID', 'Source query is invalid.');
}

function mapSourceError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (
    error instanceof SourceProjectNotFoundError ||
    error instanceof SourceProjectIdValidationError
  ) {
    return new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  }
  if (error instanceof SourceProjectArchivedError) {
    return new AppError(409, 'PROJECT_ARCHIVED', 'Project is archived.');
  }
  if (
    error instanceof SourceQueryError ||
    error instanceof SourceQueryValidationError
  ) {
    return sourceQueryError();
  }
  if (
    error instanceof SourcePersistenceError &&
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

export function createListSourcesController(
  sourceService: SourceService | undefined,
): RequestHandler {
  return async (request, response, next) => {
    if (sourceService === undefined) {
      next(
        new AppError(
          503,
          'PERSISTENCE_NOT_CONFIGURED',
          'Persistence is not available.',
        ),
      );
      return;
    }

    try {
      const query = parseSourceListRequest(request);
      const principal = getRequestPrincipal(request);
      const result = await sourceService.listSources({
        workspaceId: principal.workspace.id,
        ...query,
      });

      response.set('Cache-Control', 'no-store');
      response.status(200).json({
        data: result.sources,
        meta: {
          page: {
            limit: result.limit,
            nextCursor: result.nextCursor ?? null,
            hasMore: result.hasMore,
          },
        },
      });
    } catch (error: unknown) {
      next(mapSourceError(error));
    }
  };
}
