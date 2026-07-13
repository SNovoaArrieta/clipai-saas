import { Router } from 'express';

import type { IdentityVerifier } from '../identity/identity-verifier.js';
import { healthRouter } from './health.route.js';
import { createMeRouter } from './me.route.js';

export function createApiRouter(
  identityVerifier: IdentityVerifier | undefined,
) {
  const apiRouter = Router();

  apiRouter.use('/health', healthRouter);
  apiRouter.use('/api/v1/me', createMeRouter(identityVerifier));

  return apiRouter;
}
