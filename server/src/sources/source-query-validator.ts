import type { Request } from 'express';

import { decodeSourceCursor, SourceCursorError } from './source-cursor.js';
import {
  SOURCE_LIST_DEFAULT_LIMIT,
  SOURCE_LIST_MAX_LIMIT,
  type SourcePageCursor,
} from './source-service.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SourceProjectIdValidationError extends Error {
  public constructor() {
    super('Project ID is invalid.');
    this.name = 'SourceProjectIdValidationError';
  }
}

export class SourceQueryValidationError extends Error {
  public constructor() {
    super('Source query is invalid.');
    this.name = 'SourceQueryValidationError';
  }
}

export interface ParsedSourceListRequest {
  readonly projectId: string;
  readonly limit: number;
  readonly cursor?: SourcePageCursor;
}

export function parseSourceListRequest(
  request: Request,
): ParsedSourceListRequest {
  const projectId = request.params.projectId;
  if (typeof projectId !== 'string' || !uuidPattern.test(projectId)) {
    throw new SourceProjectIdValidationError();
  }

  const allowedKeys = new Set(['limit', 'cursor']);
  if (Object.keys(request.query).some((key) => !allowedKeys.has(key))) {
    throw new SourceQueryValidationError();
  }

  const rawLimit = request.query.limit;
  let limit = SOURCE_LIST_DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    if (
      typeof rawLimit !== 'string' ||
      !/^[1-9]\d*$/.test(rawLimit) ||
      Number(rawLimit) > SOURCE_LIST_MAX_LIMIT
    ) {
      throw new SourceQueryValidationError();
    }
    limit = Number(rawLimit);
  }

  const rawCursor = request.query.cursor;
  if (rawCursor === undefined) {
    return { projectId, limit };
  }
  if (typeof rawCursor !== 'string') {
    throw new SourceQueryValidationError();
  }

  try {
    return { projectId, limit, cursor: decodeSourceCursor(rawCursor) };
  } catch (error: unknown) {
    if (error instanceof SourceCursorError) {
      throw new SourceQueryValidationError();
    }
    throw error;
  }
}
