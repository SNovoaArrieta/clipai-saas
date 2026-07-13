import type { Request, RequestHandler } from 'express';

import { AppError } from '../shared/errors/app-error.js';
import type { AuthenticatedIdentity } from './authenticated-identity.js';
import { BearerTokenError, extractBearerToken } from './bearer-token.js';
import {
  IdentityVerificationError,
  type IdentityVerifier,
} from './identity-verifier.js';

const authenticatedIdentityKey = Symbol('authenticatedIdentity');

type AuthenticatedRequest = Request & {
  [authenticatedIdentityKey]?: AuthenticatedIdentity;
};

export function getAuthenticatedIdentity(
  request: Request,
): AuthenticatedIdentity {
  const identity = (request as AuthenticatedRequest)[authenticatedIdentityKey];

  if (identity === undefined) {
    throw new Error(
      'Authenticated identity is missing from the request context.',
    );
  }

  return identity;
}

export function requireAuthentication(
  identityVerifier: IdentityVerifier | undefined,
): RequestHandler {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store');

    if (identityVerifier === undefined) {
      next(
        new AppError(
          503,
          'AUTH_NOT_CONFIGURED',
          'Authentication is not available.',
        ),
      );
      return;
    }

    let token: string;

    try {
      token = extractBearerToken(request.headersDistinct.authorization);
    } catch (error: unknown) {
      if (error instanceof BearerTokenError && error.reason === 'missing') {
        next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
        return;
      }

      next(
        new AppError(
          401,
          'AUTH_INVALID',
          'Authentication credentials are invalid.',
        ),
      );
      return;
    }

    try {
      const identity = await identityVerifier.verifyAccessToken(token);
      (request as AuthenticatedRequest)[authenticatedIdentityKey] = identity;
      next();
    } catch (error: unknown) {
      if (
        error instanceof IdentityVerificationError &&
        error.failure === 'unavailable'
      ) {
        next(
          new AppError(
            503,
            'AUTH_VERIFICATION_UNAVAILABLE',
            'Authentication verification is temporarily unavailable.',
          ),
        );
        return;
      }

      next(
        new AppError(
          401,
          'AUTH_INVALID',
          'Authentication credentials are invalid.',
        ),
      );
    }
  };
}
