import { Router } from 'express';

import { createAttestationController } from '../attestations/attestation-controller.js';
import type { AttestationService } from '../attestations/attestation-service.js';
import type { IdentityVerifier } from '../identity/identity-verifier.js';
import { requireAuthentication } from '../identity/require-authentication.js';
import { resolveRequestPrincipal } from '../principal/request-principal.js';
import type { IdentityProvisioner } from '../provisioning/identity-provisioner.js';

export function createAttestationsRouter(
  identityVerifier: IdentityVerifier | undefined,
  identityProvisioner: IdentityProvisioner | undefined,
  attestationService: AttestationService | undefined,
) {
  const router = Router({ mergeParams: true });

  router.post(
    '/',
    requireAuthentication(identityVerifier),
    resolveRequestPrincipal(identityProvisioner),
    createAttestationController(attestationService),
  );

  return router;
}
