import { Router } from 'express';

import {
  getAuthenticatedIdentity,
  requireAuthentication,
} from '../identity/require-authentication.js';
import type { IdentityVerifier } from '../identity/identity-verifier.js';

export function createMeRouter(identityVerifier: IdentityVerifier | undefined) {
  const meRouter = Router();

  meRouter.get(
    '/',
    requireAuthentication(identityVerifier),
    (request, response) => {
      const identity = getAuthenticatedIdentity(request);
      const data =
        identity.email === undefined
          ? { authSubject: identity.authSubject }
          : { authSubject: identity.authSubject, email: identity.email };

      response.status(200).json({ data });
    },
  );

  return meRouter;
}
