export type SourceProjectVisibility = 'available' | 'archived' | 'missing';

export interface SourceRecord {
  readonly id: string;
  readonly projectId: string;
  readonly sourceType: 'upload';
  readonly safeReference: string;
  readonly state: 'submitted' | 'validating' | 'accepted' | 'rejected';
  readonly isActive: boolean;
  readonly durationMs: bigint | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SourceRepositoryCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface ListSourceRecordsInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly limit: number;
  readonly cursor?: SourceRepositoryCursor;
}

export interface SourceRepository {
  getProjectVisibility(
    workspaceId: string,
    projectId: string,
  ): Promise<SourceProjectVisibility>;
  listSourceRecords(
    input: ListSourceRecordsInput,
  ): Promise<readonly SourceRecord[]>;
}
