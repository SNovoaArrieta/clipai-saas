import { SourceNotReadyForAttestationError } from './attestation-errors.js';

export interface AttestationSourceState {
  readonly sourceType: 'upload';
  readonly state: 'submitted' | 'validating' | 'accepted' | 'rejected';
  readonly isActive: boolean;
  readonly uploadIntent: { readonly completedAt: Date | null } | null;
}

export function assertSourceReadyForAttestation(
  source: AttestationSourceState,
): void {
  if (
    source.sourceType !== 'upload' ||
    source.state !== 'validating' ||
    source.isActive ||
    source.uploadIntent === null ||
    source.uploadIntent.completedAt === null
  ) {
    throw new SourceNotReadyForAttestationError();
  }
}
