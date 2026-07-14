import { Router } from 'express';

import type { AppDependencies } from '../app.js';
import { healthRouter } from './health.route.js';
import { createMeRouter } from './me.route.js';
import { createProjectsRouter } from './projects.route.js';
import { createUploadIntentsRouter } from './upload-intents.route.js';

export function createApiRouter(dependencies: AppDependencies) {
  const apiRouter = Router();

  apiRouter.use('/health', healthRouter);
  apiRouter.use(
    '/api/v1/me',
    createMeRouter(
      dependencies.identityVerifier,
      dependencies.identityProvisioner,
    ),
  );
  apiRouter.use(
    '/api/v1/projects/:projectId/upload-intents',
    createUploadIntentsRouter(
      dependencies.identityVerifier,
      dependencies.identityProvisioner,
      dependencies.uploadIntentService,
      dependencies.objectStorage,
    ),
  );
  apiRouter.use(
    '/api/v1/projects',
    createProjectsRouter(
      dependencies.identityVerifier,
      dependencies.identityProvisioner,
      dependencies.projectService,
    ),
  );

  return apiRouter;
}
