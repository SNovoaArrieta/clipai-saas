import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';

import type { AttestationService } from './attestations/attestation-service.js';
import { assertNoDuplicateAttestationJsonFields } from './attestations/attestation-validator.js';
import type { IdentityVerifier } from './identity/identity-verifier.js';
import type { ProjectService } from './projects/project-service.js';
import type { IdentityProvisioner } from './provisioning/identity-provisioner.js';
import { createApiRouter } from './routes/index.js';
import { AppError } from './shared/errors/app-error.js';
import type { ObjectStorage } from './storage/object-storage.js';
import type { SourceService } from './sources/source-service.js';
import type { UploadIntentService } from './uploads/upload-intent-service.js';
import type { SourceValidationService } from './sources/source-validation-service.js';
import type { MediaInspector } from './media/media-inspector.js';

export interface AppDependencies {
  readonly attestationService?: AttestationService;
  readonly identityVerifier?: IdentityVerifier;
  readonly identityProvisioner?: IdentityProvisioner;
  readonly projectService?: ProjectService;
  readonly sourceService?: SourceService;
  readonly uploadIntentService?: UploadIntentService;
  readonly objectStorage?: ObjectStorage;
  readonly sourceValidationService?: SourceValidationService;
  readonly mediaInspector?: MediaInspector;
}

const notFoundHandler: RequestHandler = (request, response, next) => {
  void request;
  void response;
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
) => {
  void next;

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400 &&
    request.path.endsWith('/validate') &&
    request.path.includes('/sources/')
  ) {
    response.status(400).json({
      error: {
        code: 'SOURCE_VALIDATION_INPUT_INVALID',
        message: 'Source validation input is invalid.',
      },
    });
    return;
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400 &&
    request.path.includes('/attestations')
  ) {
    response.status(400).json({
      error: {
        code: 'ATTESTATION_INPUT_INVALID',
        message: 'Attestation input is invalid.',
      },
    });
    return;
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400 &&
    request.path.endsWith('/confirm') &&
    request.path.includes('/upload-intents/')
  ) {
    response.status(400).json({
      error: {
        code: 'UPLOAD_CONFIRMATION_INVALID',
        message: 'Upload confirmation is invalid.',
      },
    });
    return;
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400 &&
    request.path.includes('/upload-intents')
  ) {
    response.status(400).json({
      error: {
        code: 'UPLOAD_INPUT_INVALID',
        message: 'Upload input is invalid.',
      },
    });
    return;
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400 &&
    request.path.startsWith('/api/v1/projects')
  ) {
    response.status(400).json({
      error: {
        code: 'PROJECT_INPUT_INVALID',
        message: 'Project input is invalid.',
      },
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    express.json({
      verify: (request, _response, buffer) => {
        if (request.url?.includes('/attestations') === true) {
          assertNoDuplicateAttestationJsonFields(buffer);
        }
      },
    }),
  );
  app.use(createApiRouter(dependencies));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
