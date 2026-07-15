import { encodeSourceCursor } from './source-cursor.js';
import type { SourceRecord, SourceRepository } from './source-repository.js';
import { toSourceView, type SourceView } from './source-serializer.js';

export const SOURCE_LIST_DEFAULT_LIMIT = 20;
export const SOURCE_LIST_MAX_LIMIT = 100;

export interface SourcePageCursor {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly createdAt: Date;
  readonly id: string;
}

export interface ListSourcesInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly limit: number;
  readonly cursor?: SourcePageCursor;
}

export interface SourceList {
  readonly sources: readonly SourceView[];
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

export interface SourceService {
  listSources(input: ListSourcesInput): Promise<SourceList>;
}

export class SourceProjectNotFoundError extends Error {
  public constructor() {
    super('Project was not found.');
    this.name = 'SourceProjectNotFoundError';
  }
}

export class SourceProjectArchivedError extends Error {
  public constructor() {
    super('Project is archived.');
    this.name = 'SourceProjectArchivedError';
  }
}

export class SourceQueryError extends Error {
  public constructor() {
    super('Source query failed validation.');
    this.name = 'SourceQueryError';
  }
}

export type SourcePersistenceFailure = 'unavailable' | 'internal';

export class SourcePersistenceError extends Error {
  public constructor(public readonly failure: SourcePersistenceFailure) {
    super('Source persistence failed.');
    this.name = 'SourcePersistenceError';
  }
}

export class DefaultSourceService implements SourceService {
  public constructor(private readonly repository: SourceRepository) {}

  public async listSources(input: ListSourcesInput): Promise<SourceList> {
    if (
      input.cursor !== undefined &&
      (input.cursor.workspaceId !== input.workspaceId ||
        input.cursor.projectId !== input.projectId)
    ) {
      throw new SourceQueryError();
    }

    const visibility = await this.repository.getProjectVisibility(
      input.workspaceId,
      input.projectId,
    );
    if (visibility === 'missing') {
      throw new SourceProjectNotFoundError();
    }
    if (visibility === 'archived') {
      throw new SourceProjectArchivedError();
    }

    const records = await this.repository.listSourceRecords({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      limit: input.limit + 1,
      ...(input.cursor === undefined
        ? {}
        : {
            cursor: {
              createdAt: input.cursor.createdAt,
              id: input.cursor.id,
            },
          }),
    });
    const hasMore = records.length > input.limit;
    const visibleRecords = hasMore ? records.slice(0, input.limit) : records;
    const last = visibleRecords.at(-1);

    return {
      sources: visibleRecords.map((source) => toSourceView(source)),
      limit: input.limit,
      hasMore,
      ...(hasMore && last !== undefined
        ? { nextCursor: this.encodeCursor(input, last) }
        : {}),
    };
  }

  private encodeCursor(input: ListSourcesInput, source: SourceRecord): string {
    return encodeSourceCursor({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      createdAt: source.createdAt,
      id: source.id,
    });
  }
}
