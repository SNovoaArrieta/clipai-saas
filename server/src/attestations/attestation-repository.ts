import type { OwnershipStatementVersion } from './ownership-statement-registry.js';

export type AuthorizationBasis = 'owner' | 'authorized_by_owner';

export interface CreateAttestationInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly userId: string;
  readonly statementVersion: OwnershipStatementVersion;
  readonly authorizationBasis: AuthorizationBasis;
  readonly idempotencyKey: string;
}

export interface AttestationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly userId: string;
  readonly statementVersion: OwnershipStatementVersion;
  readonly authorizationBasis: AuthorizationBasis;
  readonly attestedAt: Date;
  readonly createIdempotencyKey: string;
}

export interface CreateAttestationRepositoryResult {
  readonly attestation: AttestationRecord;
  readonly replayed: boolean;
}

export interface AttestationRepository {
  createAttestation(
    input: CreateAttestationInput,
  ): Promise<CreateAttestationRepositoryResult>;
}
