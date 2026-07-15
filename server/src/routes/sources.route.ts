import { Router } from 'express';

import type { IdentityVerifier } from '../identity/identity-verifier.js';
import { requireAuthentication } from '../identity/require-authentication.js';
import { resolveRequestPrincipal } from '../principal/request-principal.js';
import type { IdentityProvisioner } from '../provisioning/identity-provisioner.js';
import { createListSourcesController } from '../sources/source-controller.js';
import type { SourceService } from '../sources/source-service.js';

export function createSourcesRouter(
  identityVerifier: IdentityVerifier | undefined,
  identityProvisioner: IdentityProvisioner | undefined,
  sourceService: SourceService | undefined,
) {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requireAuthentication(identityVerifier),
    resolveRequestPrincipal(identityProvisioner),
    createListSourcesController(sourceService),
  );

  return router;
}
