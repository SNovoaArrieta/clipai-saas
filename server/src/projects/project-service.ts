export const PROJECT_TITLE_MAX_LENGTH = 160;
export const PROJECT_LIST_DEFAULT_LIMIT = 20;
export const PROJECT_LIST_MAX_LIMIT = 100;

export interface ProjectView {
  readonly id: string;
  readonly title: string;
  readonly state: 'draft' | 'active' | 'archived';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export interface ProjectPageCursor {
  readonly workspaceId: string;
  readonly updatedAt: Date;
  readonly id: string;
}

export interface CreateProjectInput {
  readonly workspaceId: string;
  readonly title: string;
  readonly idempotencyKey: string;
}

export interface CreateProjectResult {
  readonly project: ProjectView;
  readonly replayed: boolean;
}

export interface ListProjectsInput {
  readonly workspaceId: string;
  readonly limit: number;
  readonly cursor?: ProjectPageCursor;
}

export interface ProjectList {
  readonly projects: readonly ProjectView[];
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

export interface ProjectService {
  createProject(input: CreateProjectInput): Promise<CreateProjectResult>;
  listProjects(input: ListProjectsInput): Promise<ProjectList>;
}

export type ProjectPersistenceFailure = 'unavailable' | 'internal';

export class ProjectPersistenceError extends Error {
  public constructor(public readonly failure: ProjectPersistenceFailure) {
    super('Project persistence failed.');
    this.name = 'ProjectPersistenceError';
  }
}

export class ProjectIdempotencyConflictError extends Error {
  public constructor() {
    super('Project idempotency conflict.');
    this.name = 'ProjectIdempotencyConflictError';
  }
}

export class ProjectQueryError extends Error {
  public constructor() {
    super('Project query failed validation.');
    this.name = 'ProjectQueryError';
  }
}
