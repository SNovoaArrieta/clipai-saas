import type { AuthenticatedIdentity } from './authenticated-identity.js';

export interface IdentityVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedIdentity>;
}

export type IdentityVerificationFailure = 'invalid' | 'unavailable';

export class IdentityVerificationError extends Error {
  public constructor(public readonly failure: IdentityVerificationFailure) {
    super('Identity verification failed');
    this.name = 'IdentityVerificationError';
  }
}
