import type { RequestHandler } from 'express';

import { getRequestPrincipal } from '../principal/request-principal.js';
import { AppError } from '../shared/errors/app-error.js';
import {
  AttestationAlreadyExistsError,
  AttestationIdempotencyConflictError,
  AttestationPersistenceError,
  AttestationProjectArchivedError,
  AttestationProjectNotFoundError,
  AttestationSourceNotFoundError,
  SourceNotReadyForAttestationError,
} from './attestation-errors.js';
import type { AttestationService } from './attestation-service.js';
import {
  AttestationIdempotencyKeyRequiredError,
  AttestationInputValidationError,
  AttestationProjectIdValidationError,
  AttestationSourceIdValidationError,
  parseAttestationRequest,
} from './attestation-validator.js';

function mapAttestationError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof AttestationProjectNotFoundError) {
    return new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  }
  if (error instanceof AttestationProjectArchivedError) {
    return new AppError(409, 'PROJECT_ARCHIVED', 'Project is archived.');
  }
  if (error instanceof AttestationSourceNotFoundError) {
    return new AppError(404, 'SOURCE_NOT_FOUND', 'Source was not found.');
  }
  if (error instanceof SourceNotReadyForAttestationError) {
    return new AppError(
      409,
      'SOURCE_NOT_READY_FOR_ATTESTATION',
      'Source is not ready for attestation.',
    );
  }
  if (error instanceof AttestationIdempotencyKeyRequiredError) {
    return new AppError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key is required.',
    );
  }
  if (
    error instanceof AttestationInputValidationError ||
    error instanceof AttestationProjectIdValidationError ||
    error instanceof AttestationSourceIdValidationError
  ) {
    return new AppError(
      400,
      'ATTESTATION_INPUT_INVALID',
      'Attestation input is invalid.',
    );
  }
  if (error instanceof AttestationIdempotencyConflictError) {
    return new AppError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Idempotency-Key was already used for another request.',
    );
  }
  if (error instanceof AttestationAlreadyExistsError) {
    return new AppError(
      409,
      'ATTESTATION_ALREADY_EXISTS',
      'An attestation already exists for this Source and statement version.',
    );
  }
  if (
    error instanceof AttestationPersistenceError &&
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

export function createAttestationController(
  attestationService: AttestationService | undefined,
): RequestHandler {
  return async (request, response, next) => {
    if (attestationService === undefined) {
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
      const input = parseAttestationRequest(request);
      const result = await attestationService.createAttestation({
        workspaceId: principal.workspace.id,
        userId: principal.user.id,
        ...input,
      });

      response.location(
        `/api/v1/projects/${input.projectId}/sources/${input.sourceId}/attestations/${result.attestation.id}`,
      );
      response.set('Cache-Control', 'no-store');
      if (result.replayed) {
        response.set('Idempotency-Replayed', 'true');
      }
      response.status(201).json({ data: result.attestation });
    } catch (error: unknown) {
      next(mapAttestationError(error));
    }
  };
}
