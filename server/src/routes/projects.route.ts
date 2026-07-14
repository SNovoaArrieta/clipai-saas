import { Router, type Request } from 'express';

import type { IdentityVerifier } from '../identity/identity-verifier.js';
import { requireAuthentication } from '../identity/require-authentication.js';
import {
  getRequestPrincipal,
  resolveRequestPrincipal,
} from '../principal/request-principal.js';
import {
  decodeProjectCursor,
  ProjectCursorError,
} from '../projects/project-cursor.js';
import {
  PROJECT_LIST_DEFAULT_LIMIT,
  PROJECT_LIST_MAX_LIMIT,
  PROJECT_TITLE_MAX_LENGTH,
  ProjectIdempotencyConflictError,
  ProjectPersistenceError,
  ProjectQueryError,
  type ProjectService,
} from '../projects/project-service.js';
import type { IdentityProvisioner } from '../provisioning/identity-provisioner.js';
import { AppError } from '../shared/errors/app-error.js';

const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{16,255}$/;
const controlCharacterPattern = /\p{Cc}/u;

function projectInputError(message = 'Project input is invalid.'): AppError {
  return new AppError(400, 'PROJECT_INPUT_INVALID', message);
}

function projectQueryError(): AppError {
  return new AppError(
    400,
    'PROJECT_QUERY_INVALID',
    'Project query is invalid.',
  );
}

function parseTitle(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw projectInputError();
  }

  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.title !== 'string') {
    throw projectInputError();
  }

  const title = input.title.trim();
  const titleLength = [...title].length;
  if (
    titleLength < 1 ||
    titleLength > PROJECT_TITLE_MAX_LENGTH ||
    controlCharacterPattern.test(title)
  ) {
    throw projectInputError();
  }

  return title;
}

function parseIdempotencyKey(request: Request): string {
  const values = request.headersDistinct['idempotency-key'];

  if (values === undefined) {
    throw new AppError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key is required.',
    );
  }

  if (values.length !== 1 || !idempotencyKeyPattern.test(values[0] ?? '')) {
    throw projectInputError('Idempotency-Key is invalid.');
  }

  return values[0] as string;
}

function parseListQuery(request: Request) {
  const allowedKeys = new Set(['limit', 'cursor']);
  if (Object.keys(request.query).some((key) => !allowedKeys.has(key))) {
    throw projectQueryError();
  }

  const rawLimit = request.query.limit;
  let limit = PROJECT_LIST_DEFAULT_LIMIT;

  if (rawLimit !== undefined) {
    if (
      typeof rawLimit !== 'string' ||
      !/^[1-9]\d*$/.test(rawLimit) ||
      Number(rawLimit) > PROJECT_LIST_MAX_LIMIT
    ) {
      throw projectQueryError();
    }

    limit = Number(rawLimit);
  }

  const rawCursor = request.query.cursor;
  if (rawCursor === undefined) {
    return { limit };
  }

  if (typeof rawCursor !== 'string') {
    throw projectQueryError();
  }

  try {
    return { limit, cursor: decodeProjectCursor(rawCursor) };
  } catch (error: unknown) {
    if (error instanceof ProjectCursorError) {
      throw projectQueryError();
    }

    throw error;
  }
}

function mapProjectError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ProjectIdempotencyConflictError) {
    return new AppError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Idempotency-Key was already used for another request.',
    );
  }

  if (error instanceof ProjectQueryError) {
    return projectQueryError();
  }

  if (
    error instanceof ProjectPersistenceError &&
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

export function createProjectsRouter(
  identityVerifier: IdentityVerifier | undefined,
  identityProvisioner: IdentityProvisioner | undefined,
  projectService: ProjectService | undefined,
) {
  const projectsRouter = Router();

  projectsRouter.use(
    requireAuthentication(identityVerifier),
    resolveRequestPrincipal(identityProvisioner),
  );

  projectsRouter.post('/', async (request, response, next) => {
    if (projectService === undefined) {
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
      const principal = getRequestPrincipal(request);
      const result = await projectService.createProject({
        workspaceId: principal.workspace.id,
        title: parseTitle(request.body),
        idempotencyKey: parseIdempotencyKey(request),
      });

      response.location(`/api/v1/projects/${result.project.id}`);
      if (result.replayed) {
        response.set('Idempotency-Replayed', 'true');
      }
      response.status(201).json({ data: result.project });
    } catch (error: unknown) {
      next(mapProjectError(error));
    }
  });

  projectsRouter.get('/', async (request, response, next) => {
    if (projectService === undefined) {
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
      const principal = getRequestPrincipal(request);
      const query = parseListQuery(request);
      const result = await projectService.listProjects({
        workspaceId: principal.workspace.id,
        ...query,
      });

      response.status(200).json({
        data: result.projects,
        meta: {
          page: {
            limit: result.limit,
            nextCursor: result.nextCursor ?? null,
            hasMore: result.hasMore,
          },
        },
      });
    } catch (error: unknown) {
      next(mapProjectError(error));
    }
  });

  return projectsRouter;
}
