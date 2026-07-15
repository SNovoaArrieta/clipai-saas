import type {
  AttestationRepository,
  CreateAttestationInput,
} from './attestation-repository.js';
import {
  toAttestationView,
  type AttestationView,
} from './attestation-serializer.js';

export interface CreateAttestationResult {
  readonly attestation: AttestationView;
  readonly replayed: boolean;
}

export interface AttestationService {
  createAttestation(
    input: CreateAttestationInput,
  ): Promise<CreateAttestationResult>;
}

export class DefaultAttestationService implements AttestationService {
  public constructor(private readonly repository: AttestationRepository) {}

  public async createAttestation(
    input: CreateAttestationInput,
  ): Promise<CreateAttestationResult> {
    const result = await this.repository.createAttestation(input);
    return {
      attestation: toAttestationView(result.attestation),
      replayed: result.replayed,
    };
  }
}
