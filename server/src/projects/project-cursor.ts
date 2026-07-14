import type { ProjectPageCursor } from './project-service.js';

const maximumEncodedCursorLength = 512;
const encodedCursorPattern = /^[A-Za-z0-9_-]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CursorPayload {
  readonly version: 1;
  readonly workspaceId: string;
  readonly updatedAt: string;
  readonly id: string;
}

export class ProjectCursorError extends Error {
  public constructor() {
    super('Invalid project cursor.');
    this.name = 'ProjectCursorError';
  }
}

export function encodeProjectCursor(cursor: ProjectPageCursor): string {
  const payload: CursorPayload = {
    version: 1,
    workspaceId: cursor.workspaceId,
    updatedAt: cursor.updatedAt.toISOString(),
    id: cursor.id,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeProjectCursor(encoded: string): ProjectPageCursor {
  if (
    encoded.length === 0 ||
    encoded.length > maximumEncodedCursorLength ||
    !encodedCursorPattern.test(encoded)
  ) {
    throw new ProjectCursorError();
  }

  let payload: unknown;

  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new ProjectCursorError();
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new ProjectCursorError();
  }

  const candidate = payload as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 4 ||
    candidate.version !== 1 ||
    typeof candidate.workspaceId !== 'string' ||
    typeof candidate.updatedAt !== 'string' ||
    typeof candidate.id !== 'string' ||
    !uuidPattern.test(candidate.workspaceId) ||
    !uuidPattern.test(candidate.id)
  ) {
    throw new ProjectCursorError();
  }

  const updatedAt = new Date(candidate.updatedAt);
  if (
    Number.isNaN(updatedAt.getTime()) ||
    updatedAt.toISOString() !== candidate.updatedAt
  ) {
    throw new ProjectCursorError();
  }

  return {
    workspaceId: candidate.workspaceId,
    updatedAt,
    id: candidate.id,
  };
}
