import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { isPersistenceUnavailable } from '../database/database-errors.js';
import { encodeProjectCursor } from './project-cursor.js';
import {
  ProjectIdempotencyConflictError,
  ProjectPersistenceError,
  ProjectQueryError,
  type CreateProjectInput,
  type CreateProjectResult,
  type ListProjectsInput,
  type ProjectList,
  type ProjectService,
  type ProjectView,
} from './project-service.js';

const projectSelection = {
  id: true,
  title: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} as const;

type ProjectRecord = {
  readonly id: string;
  readonly title: string;
  readonly state: 'draft' | 'active' | 'archived';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
};

function toProjectView(project: ProjectRecord): ProjectView {
  return {
    id: project.id,
    title: project.title,
    state: project.state,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() ?? null,
  };
}

function toPersistenceError(error: unknown): ProjectPersistenceError {
  return new ProjectPersistenceError(
    isPersistenceUnavailable(error) ? 'unavailable' : 'internal',
  );
}

export class PrismaProjectService implements ProjectService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createProject(
    input: CreateProjectInput,
  ): Promise<CreateProjectResult> {
    try {
      const existing = await this.findByIdempotencyKey(input);

      if (existing !== null) {
        return this.toReplay(existing, input.title);
      }

      try {
        const project = await this.prisma.project.create({
          data: {
            workspaceId: input.workspaceId,
            title: input.title,
            createIdempotencyKey: input.idempotencyKey,
          },
          select: projectSelection,
        });

        return { project: toProjectView(project), replayed: false };
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const concurrent = await this.findByIdempotencyKey(input);

          if (concurrent !== null) {
            return this.toReplay(concurrent, input.title);
          }
        }

        throw error;
      }
    } catch (error: unknown) {
      if (error instanceof ProjectIdempotencyConflictError) {
        throw error;
      }

      throw toPersistenceError(error);
    }
  }

  public async listProjects(input: ListProjectsInput): Promise<ProjectList> {
    if (
      input.cursor !== undefined &&
      input.cursor.workspaceId !== input.workspaceId
    ) {
      throw new ProjectQueryError();
    }

    try {
      const cursorFilter =
        input.cursor === undefined
          ? {}
          : {
              OR: [
                { updatedAt: { lt: input.cursor.updatedAt } },
                {
                  updatedAt: input.cursor.updatedAt,
                  id: { lt: input.cursor.id },
                },
              ],
            };
      const records = await this.prisma.project.findMany({
        where: {
          workspaceId: input.workspaceId,
          state: { not: 'archived' },
          archivedAt: null,
          ...cursorFilter,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        select: projectSelection,
      });
      const hasMore = records.length > input.limit;
      const visibleRecords = hasMore ? records.slice(0, input.limit) : records;
      const last = visibleRecords.at(-1);

      return {
        projects: visibleRecords.map(toProjectView),
        limit: input.limit,
        hasMore,
        ...(hasMore && last !== undefined
          ? {
              nextCursor: encodeProjectCursor({
                workspaceId: input.workspaceId,
                updatedAt: last.updatedAt,
                id: last.id,
              }),
            }
          : {}),
      };
    } catch (error: unknown) {
      throw toPersistenceError(error);
    }
  }

  private findByIdempotencyKey(input: CreateProjectInput) {
    return this.prisma.project.findUnique({
      where: {
        workspaceId_createIdempotencyKey: {
          workspaceId: input.workspaceId,
          createIdempotencyKey: input.idempotencyKey,
        },
      },
      select: projectSelection,
    });
  }

  private toReplay(
    project: ProjectRecord,
    requestedTitle: string,
  ): CreateProjectResult {
    if (project.title !== requestedTitle) {
      throw new ProjectIdempotencyConflictError();
    }

    return { project: toProjectView(project), replayed: true };
  }
}
