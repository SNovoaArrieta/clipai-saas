import type { Request, RequestHandler } from 'express';

import { consumeAuthenticatedIdentity } from '../identity/require-authentication.js';
import {
  IdentityProvisioningError,
  type IdentityProvisioner,
  type ProvisionedIdentity,
} from '../provisioning/identity-provisioner.js';
import { AppError } from '../shared/errors/app-error.js';

export type RequestPrincipal = ProvisionedIdentity;

const requestPrincipalKey = Symbol('requestPrincipal');

type PrincipalRequest = Request & {
  [requestPrincipalKey]?: RequestPrincipal;
};

export function getRequestPrincipal(request: Request): RequestPrincipal {
  const principal = (request as PrincipalRequest)[requestPrincipalKey];

  if (principal === undefined) {
    throw new Error('Request principal is missing from the request context.');
  }

  return principal;
}

export function resolveRequestPrincipal(
  identityProvisioner: IdentityProvisioner | undefined,
): RequestHandler {
  return async (request, _response, next) => {
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

    const identity = consumeAuthenticatedIdentity(request);

    try {
      (request as PrincipalRequest)[requestPrincipalKey] =
        await identityProvisioner.provision(identity);
      next();
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
  };
}
