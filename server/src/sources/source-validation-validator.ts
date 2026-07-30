import type { Request } from 'express';

import type { ValidateSourceInput } from './source-validation-repository.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SourceValidationInputError extends Error {
  public constructor() {
    super('Source validation input is invalid.');
    this.name = 'SourceValidationInputError';
  }
}

export function parseSourceValidationRequest(
  request: Request,
): Omit<ValidateSourceInput, 'workspaceId'> {
  const projectId = request.params.projectId;
  const sourceId = request.params.sourceId;
  if (
    typeof projectId !== 'string' ||
    !uuidPattern.test(projectId) ||
    typeof sourceId !== 'string' ||
    !uuidPattern.test(sourceId) ||
    Object.keys(request.query).length !== 0
  ) {
    throw new SourceValidationInputError();
  }

  const body = request.body as unknown;
  let hasEnumerableField = false;
  if (typeof body === 'object' && body !== null) {
    for (const field in body) {
      void field;
      hasEnumerableField = true;
      break;
    }
  }
  if (
    body !== undefined &&
    (typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 0 ||
      hasEnumerableField)
  ) {
    throw new SourceValidationInputError();
  }

  return { projectId, sourceId };
}
