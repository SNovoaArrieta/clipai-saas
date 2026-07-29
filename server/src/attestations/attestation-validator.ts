import type { Request } from 'express';

import { isOwnershipStatementVersion } from './ownership-statement-registry.js';
import type { AuthorizationBasis } from './attestation-repository.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{16,255}$/;
const authorizationBases = new Set<AuthorizationBasis>([
  'owner',
  'authorized_by_owner',
]);

export function assertNoDuplicateAttestationJsonFields(rawBody: Buffer): void {
  const json = rawBody.toString('utf8');
  const keys = new Set<string>();
  let depth = 0;

  for (let index = 0; index < json.length; index += 1) {
    const character = json[index];
    if (character === '{' || character === '[') {
      depth += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      depth -= 1;
      continue;
    }
    if (character !== '"') {
      continue;
    }

    const start = index;
    index += 1;
    while (index < json.length) {
      if (json[index] === '\\') {
        index += 2;
        continue;
      }
      if (json[index] === '"') {
        break;
      }
      index += 1;
    }
    if (depth !== 1 || index >= json.length) {
      continue;
    }

    let separator = index + 1;
    while (/\s/.test(json[separator] ?? '')) {
      separator += 1;
    }
    if (json[separator] !== ':') {
      continue;
    }

    let key: unknown;
    try {
      key = JSON.parse(json.slice(start, index + 1));
    } catch {
      continue;
    }
    if (typeof key !== 'string') {
      continue;
    }
    if (keys.has(key)) {
      const error = new SyntaxError('Duplicate attestation JSON field.');
      Object.assign(error, { status: 400 });
      throw error;
    }
    keys.add(key);
  }
}

export class AttestationInputValidationError extends Error {
  public constructor() {
    super('Attestation input is invalid.');
    this.name = 'AttestationInputValidationError';
  }
}

export class AttestationProjectIdValidationError extends Error {
  public constructor() {
    super('Project ID is invalid.');
    this.name = 'AttestationProjectIdValidationError';
  }
}

export class AttestationSourceIdValidationError extends Error {
  public constructor() {
    super('Source ID is invalid.');
    this.name = 'AttestationSourceIdValidationError';
  }
}

export class AttestationIdempotencyKeyRequiredError extends Error {
  public constructor() {
    super('Idempotency-Key is required.');
    this.name = 'AttestationIdempotencyKeyRequiredError';
  }
}

export interface ParsedAttestationRequest {
  readonly projectId: string;
  readonly sourceId: string;
  readonly statementVersion: 'ownership-v1';
  readonly authorizationBasis: AuthorizationBasis;
  readonly idempotencyKey: string;
}

function parseIdempotencyKey(request: Request): string {
  const values = request.headersDistinct['idempotency-key'];
  if (values === undefined) {
    throw new AttestationIdempotencyKeyRequiredError();
  }
  if (values.length !== 1 || !idempotencyKeyPattern.test(values[0] ?? '')) {
    throw new AttestationInputValidationError();
  }
  return values[0] as string;
}

function hasInheritedEnumerableProperties(input: object): boolean {
  for (const key in input) {
    if (!Object.hasOwn(input, key)) {
      return true;
    }
  }
  return false;
}

export function parseAttestationRequest(
  request: Request,
): ParsedAttestationRequest {
  const projectId = request.params.projectId;
  if (typeof projectId !== 'string' || !uuidPattern.test(projectId)) {
    throw new AttestationProjectIdValidationError();
  }
  const sourceId = request.params.sourceId;
  if (typeof sourceId !== 'string' || !uuidPattern.test(sourceId)) {
    throw new AttestationSourceIdValidationError();
  }
  if (Object.keys(request.query).length !== 0) {
    throw new AttestationInputValidationError();
  }

  const body = request.body as unknown;
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    hasInheritedEnumerableProperties(body)
  ) {
    throw new AttestationInputValidationError();
  }

  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).length !== 3 ||
    input.accepted !== true ||
    !isOwnershipStatementVersion(input.statementVersion) ||
    typeof input.authorizationBasis !== 'string' ||
    !authorizationBases.has(input.authorizationBasis as AuthorizationBasis)
  ) {
    throw new AttestationInputValidationError();
  }

  return {
    projectId,
    sourceId,
    statementVersion: input.statementVersion,
    authorizationBasis: input.authorizationBasis as AuthorizationBasis,
    idempotencyKey: parseIdempotencyKey(request),
  };
}
