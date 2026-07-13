import { Router } from 'express';

import {
  getAuthenticatedIdentity,
  requireAuthentication,
} from '../identity/require-authentication.js';
import type { IdentityVerifier } from '../identity/identity-verifier.js';
import {
  IdentityProvisioningError,
  type IdentityProvisioner,
} from '../provisioning/identity-provisioner.js';
import { AppError } from '../shared/errors/app-error.js';

export function createMeRouter(
  identityVerifier: IdentityVerifier | undefined,
  identityProvisioner: IdentityProvisioner | undefined,
) {
  const meRouter = Router();

  meRouter.get(
    '/',
    requireAuthentication(identityVerifier),
    async (request, response, next) => {
      const identity = getAuthenticatedIdentity(request);

      if (identityProvisioner === undefined) {
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
        const data = await identityProvisioner.provision(identity);
        response.status(200).json({ data });
      } catch (error: unknown) {
        if (
          error instanceof IdentityProvisioningError &&
          error.failure === 'unavailable'
        ) {
          next(
            new AppError(
              503,
              'PERSISTENCE_UNAVAILABLE',
              'Persistence is temporarily unavailable.',
            ),
          );
          return;
        }

        next(new AppError(500, 'INTERNAL_ERROR', 'Internal server error'));
      }
    },
  );

  return meRouter;
}
