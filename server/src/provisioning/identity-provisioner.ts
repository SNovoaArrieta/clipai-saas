import type { AuthenticatedIdentity } from '../identity/authenticated-identity.js';

export interface ProvisionedIdentity {
  readonly user: {
    readonly id: string;
    readonly email?: string;
  };
  readonly workspace: {
    readonly id: string;
  };
}

export type IdentityProvisioningFailure = 'unavailable' | 'internal';

export class IdentityProvisioningError extends Error {
  public constructor(public readonly failure: IdentityProvisioningFailure) {
    super('Identity provisioning failed.');
    this.name = 'IdentityProvisioningError';
  }
}

export interface IdentityProvisioner {
  provision(identity: AuthenticatedIdentity): Promise<ProvisionedIdentity>;
}
