import { Router } from 'express';

import type { AppDependencies } from '../app.js';
import { healthRouter } from './health.route.js';
import { createMeRouter } from './me.route.js';

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

  return apiRouter;
}
