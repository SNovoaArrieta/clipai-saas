import { Router } from 'express';

import type { IdentityVerifier } from '../identity/identity-verifier.js';
import { requireAuthentication } from '../identity/require-authentication.js';
import { resolveRequestPrincipal } from '../principal/request-principal.js';
import type { IdentityProvisioner } from '../provisioning/identity-provisioner.js';
import { createListSourcesController } from '../sources/source-controller.js';
import type { SourceService } from '../sources/source-service.js';
import { createValidateSourceController } from '../sources/source-validation-controller.js';
import type { SourceValidationService } from '../sources/source-validation-service.js';
import type { ObjectStorage } from '../storage/object-storage.js';
import type { MediaInspector } from '../media/media-inspector.js';

export function createSourcesRouter(
  identityVerifier: IdentityVerifier | undefined,
  identityProvisioner: IdentityProvisioner | undefined,
  sourceService: SourceService | undefined,
  sourceValidationService: SourceValidationService | undefined = undefined,
  objectStorage: ObjectStorage | undefined = undefined,
  mediaInspector: MediaInspector | undefined = undefined,
) {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requireAuthentication(identityVerifier),
    resolveRequestPrincipal(identityProvisioner),
    createListSourcesController(sourceService),
  );

  router.post(
    '/:sourceId/validate',
    requireAuthentication(identityVerifier),
    resolveRequestPrincipal(identityProvisioner),
    createValidateSourceController(
      sourceValidationService,
      objectStorage,
      mediaInspector,
    ),
  );

  return router;
}
