import { createHash, timingSafeEqual } from 'node:crypto';

import type { SourcePageCursor } from './source-service.js';

const maximumEncodedCursorLength = 768;
const encodedCursorPattern = /^[A-Za-z0-9_-]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CursorFields {
  readonly version: 1;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly createdAt: string;
  readonly id: string;
}

interface CursorPayload extends CursorFields {
  readonly checksum: string;
}

export class SourceCursorError extends Error {
  public constructor() {
    super('Invalid source cursor.');
    this.name = 'SourceCursorError';
  }
}

function checksum(fields: CursorFields): string {
  return createHash('sha256')
    .update(JSON.stringify(fields), 'utf8')
    .digest('base64url');
}

export function encodeSourceCursor(cursor: SourcePageCursor): string {
  const fields: CursorFields = {
    version: 1,
    workspaceId: cursor.workspaceId,
    projectId: cursor.projectId,
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  };
  const payload: CursorPayload = { ...fields, checksum: checksum(fields) };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeSourceCursor(encoded: string): SourcePageCursor {
  if (
    encoded.length === 0 ||
    encoded.length > maximumEncodedCursorLength ||
    !encodedCursorPattern.test(encoded)
  ) {
    throw new SourceCursorError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new SourceCursorError();
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new SourceCursorError();
  }

  const candidate = payload as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 6 ||
    candidate.version !== 1 ||
    typeof candidate.workspaceId !== 'string' ||
    typeof candidate.projectId !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.id !== 'string' ||
    typeof candidate.checksum !== 'string' ||
    !uuidPattern.test(candidate.workspaceId) ||
    !uuidPattern.test(candidate.projectId) ||
    !uuidPattern.test(candidate.id)
  ) {
    throw new SourceCursorError();
  }

  const createdAt = new Date(candidate.createdAt);
  if (
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== candidate.createdAt
  ) {
    throw new SourceCursorError();
  }

  const fields: CursorFields = {
    version: 1,
    workspaceId: candidate.workspaceId,
    projectId: candidate.projectId,
    createdAt: candidate.createdAt,
    id: candidate.id,
  };
  const expected = Buffer.from(checksum(fields));
  const actual = Buffer.from(candidate.checksum);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new SourceCursorError();
  }

  return {
    workspaceId: candidate.workspaceId,
    projectId: candidate.projectId,
    createdAt,
    id: candidate.id,
  };
}
