import type { SourceRecord } from './source-repository.js';

export interface SourceView {
  readonly id: string;
  readonly projectId: string;
  readonly sourceType: 'upload';
  readonly safeReference: string;
  readonly state: 'submitted' | 'validating' | 'accepted' | 'rejected';
  readonly isActive: boolean;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class SourceSerializationError extends Error {
  public constructor() {
    super('Source could not be serialized safely.');
    this.name = 'SourceSerializationError';
  }
}

function serializeDuration(durationMs: bigint | null): number | null {
  if (durationMs === null) {
    return null;
  }

  const serialized = Number(durationMs);
  if (!Number.isSafeInteger(serialized) || serialized < 0) {
    throw new SourceSerializationError();
  }

  return serialized;
}

export function toSourceView(source: SourceRecord): SourceView {
  return {
    id: source.id,
    projectId: source.projectId,
    sourceType: source.sourceType,
    safeReference: source.safeReference,
    state: source.state,
    isActive: source.isActive,
    durationMs: serializeDuration(source.durationMs),
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}
