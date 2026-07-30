import type { SourceRecord } from './source-repository.js';

export interface ValidateSourceInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly sourceId: string;
}

export interface SourceValidationSnapshot {
  readonly objectKey: string;
  readonly storageRevision: string;
  readonly observedSizeBytes: number;
  readonly observedContentType: string;
}

export type SourceValidationPreflight =
  | {
      readonly kind: 'terminal';
      readonly source: SourceRecord;
    }
  | {
      readonly kind: 'ready';
      readonly snapshot: SourceValidationSnapshot;
    };

export type SourceValidationDisposition =
  | {
      readonly state: 'accepted';
      readonly durationMs: bigint;
    }
  | {
      readonly state: 'rejected';
      readonly durationMs: null;
    };

export interface FinalizeSourceValidationInput extends ValidateSourceInput {
  readonly storageRevision: string;
  readonly disposition: SourceValidationDisposition;
}

export interface SourceValidationFinalization {
  readonly source: SourceRecord;
  readonly replayed: boolean;
}

export interface SourceValidationRepository {
  preflight(input: ValidateSourceInput): Promise<SourceValidationPreflight>;
  finalize(
    input: FinalizeSourceValidationInput,
  ): Promise<SourceValidationFinalization>;
}
