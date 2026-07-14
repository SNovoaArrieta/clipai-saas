import { Router } from 'express';

import type { IdentityVerifier } from '../identity/identity-verifier.js';
import { requireAuthentication } from '../identity/require-authentication.js';
import {
  getRequestPrincipal,
  resolveRequestPrincipal,
} from '../principal/request-principal.js';
import type { IdentityProvisioner } from '../provisioning/identity-provisioner.js';

export function createMeRouter(
  identityVerifier: IdentityVerifier | undefined,
  identityProvisioner: IdentityProvisioner | undefined,
) {
  const meRouter = Router();

  meRouter.get(
    '/',
    requireAuthentication(identityVerifier),
    resolveRequestPrincipal(identityProvisioner),
    (request, response) => {
      response.status(200).json({ data: getRequestPrincipal(request) });
    },
  );

  return meRouter;
}
