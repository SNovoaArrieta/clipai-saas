import type { AttestationRecord } from './attestation-repository.js';

export interface AttestationView {
  readonly id: string;
  readonly sourceId: string;
  readonly statementVersion: 'ownership-v1';
  readonly authorizationBasis: 'owner' | 'authorized_by_owner';
  readonly attestedAt: string;
}

export function toAttestationView(
  attestation: AttestationRecord,
): AttestationView {
  return {
    id: attestation.id,
    sourceId: attestation.sourceId,
    statementVersion: attestation.statementVersion,
    authorizationBasis: attestation.authorizationBasis,
    attestedAt: attestation.attestedAt.toISOString(),
  };
}
