import type { PrismaClient } from '../generated/prisma/client.js';
import { isPersistenceUnavailable } from '../database/database-errors.js';
import type {
  ListSourceRecordsInput,
  SourceRepository,
  SourceProjectVisibility,
} from './source-repository.js';
import { SourcePersistenceError } from './source-service.js';

const sourceSelection = {
  id: true,
  projectId: true,
  sourceType: true,
  safeReference: true,
  state: true,
  isActive: true,
  durationMs: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toPersistenceError(error: unknown): SourcePersistenceError {
  return new SourcePersistenceError(
    isPersistenceUnavailable(error) ? 'unavailable' : 'internal',
  );
}

export class PrismaSourceRepository implements SourceRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getProjectVisibility(
    workspaceId: string,
    projectId: string,
  ): Promise<SourceProjectVisibility> {
    try {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, workspaceId },
        select: { state: true, archivedAt: true },
      });

      if (project === null) {
        return 'missing';
      }
      return project.state === 'archived' || project.archivedAt !== null
        ? 'archived'
        : 'available';
    } catch (error: unknown) {
      throw toPersistenceError(error);
    }
  }

  public async listSourceRecords(input: ListSourceRecordsInput) {
    try {
      const cursorFilter =
        input.cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                {
                  createdAt: input.cursor.createdAt,
                  id: { lt: input.cursor.id },
                },
              ],
            };
      return await this.prisma.source.findMany({
        where: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          archivedAt: null,
          project: {
            workspaceId: input.workspaceId,
            id: input.projectId,
            state: { not: 'archived' },
            archivedAt: null,
          },
          ...cursorFilter,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit,
        select: sourceSelection,
      });
    } catch (error: unknown) {
      throw toPersistenceError(error);
    }
  }
}
