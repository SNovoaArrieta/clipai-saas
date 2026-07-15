import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { isPersistenceUnavailable } from '../database/database-errors.js';
import {
  AttestationAlreadyExistsError,
  AttestationIdempotencyConflictError,
  AttestationPersistenceError,
  AttestationProjectArchivedError,
  AttestationProjectNotFoundError,
  AttestationSourceNotFoundError,
  SourceNotReadyForAttestationError,
} from './attestation-errors.js';
import { assertSourceReadyForAttestation } from './attestation-policy.js';
import type {
  AttestationRecord,
  AttestationRepository,
  CreateAttestationInput,
  CreateAttestationRepositoryResult,
} from './attestation-repository.js';
import { OWNERSHIP_STATEMENT_VERSION } from './ownership-statement-registry.js';

const attestationSelection = {
  id: true,
  workspaceId: true,
  projectId: true,
  sourceId: true,
  userId: true,
  statementVersion: true,
  authorizationBasis: true,
  attestedAt: true,
  createIdempotencyKey: true,
} as const;

type PersistedAttestation = {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly userId: string;
  readonly statementVersion: string;
  readonly authorizationBasis: 'owner' | 'authorized_by_owner';
  readonly attestedAt: Date;
  readonly createIdempotencyKey: string;
};

type LockedProject = {
  readonly state: 'draft' | 'active' | 'archived';
  readonly archivedAt: Date | null;
};

type LockedSource = {
  readonly sourceType: 'upload';
  readonly state: 'submitted' | 'validating' | 'accepted' | 'rejected';
  readonly isActive: boolean;
};

type LockedUploadIntent = {
  readonly completedAt: Date | null;
};

function toPersistenceError(error: unknown): AttestationPersistenceError {
  return new AttestationPersistenceError(
    isPersistenceUnavailable(error) ? 'unavailable' : 'internal',
  );
}

function isDomainError(error: unknown): boolean {
  return (
    error instanceof AttestationProjectNotFoundError ||
    error instanceof AttestationProjectArchivedError ||
    error instanceof AttestationSourceNotFoundError ||
    error instanceof SourceNotReadyForAttestationError ||
    error instanceof AttestationIdempotencyConflictError ||
    error instanceof AttestationAlreadyExistsError ||
    error instanceof AttestationPersistenceError
  );
}

function toRecord(attestation: PersistedAttestation): AttestationRecord {
  if (attestation.statementVersion !== OWNERSHIP_STATEMENT_VERSION) {
    throw new AttestationPersistenceError('internal');
  }
  return {
    ...attestation,
    statementVersion: OWNERSHIP_STATEMENT_VERSION,
  };
}

function isEquivalent(
  attestation: PersistedAttestation,
  input: CreateAttestationInput,
): boolean {
  return (
    attestation.workspaceId === input.workspaceId &&
    attestation.projectId === input.projectId &&
    attestation.sourceId === input.sourceId &&
    attestation.userId === input.userId &&
    attestation.statementVersion === input.statementVersion &&
    attestation.authorizationBasis === input.authorizationBasis
  );
}

export class PrismaAttestationRepository implements AttestationRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createAttestation(
    input: CreateAttestationInput,
  ): Promise<CreateAttestationRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const projects = await transaction.$queryRaw<LockedProject[]>`
          SELECT "state", "archivedAt"
          FROM "Project"
          WHERE "id" = ${input.projectId}::uuid
            AND "workspaceId" = ${input.workspaceId}::uuid
          FOR UPDATE
        `;
        const project = projects[0];
        if (project === undefined) {
          throw new AttestationProjectNotFoundError();
        }
        if (project.state === 'archived' || project.archivedAt !== null) {
          throw new AttestationProjectArchivedError();
        }

        const sources = await transaction.$queryRaw<LockedSource[]>`
          SELECT "sourceType", "state", "isActive"
          FROM "Source"
          WHERE "id" = ${input.sourceId}::uuid
            AND "workspaceId" = ${input.workspaceId}::uuid
            AND "projectId" = ${input.projectId}::uuid
            AND "archivedAt" IS NULL
          FOR UPDATE
        `;
        const source = sources[0];
        if (source === undefined) {
          throw new AttestationSourceNotFoundError();
        }
        const uploadIntents =
          await transaction.$queryRaw<LockedUploadIntent[]>`
            SELECT "completedAt"
            FROM "UploadIntent"
            WHERE "sourceId" = ${input.sourceId}::uuid
              AND "workspaceId" = ${input.workspaceId}::uuid
              AND "projectId" = ${input.projectId}::uuid
            FOR UPDATE
          `;
        assertSourceReadyForAttestation({
          ...source,
          uploadIntent: uploadIntents[0] ?? null,
        });

        const existingKey = await transaction.ownershipAttestation.findUnique({
          where: {
            workspaceId_createIdempotencyKey: {
              workspaceId: input.workspaceId,
              createIdempotencyKey: input.idempotencyKey,
            },
          },
          select: attestationSelection,
        });
        if (existingKey !== null) {
          return this.replayOrConflict(existingKey, input);
        }

        const existingStatement =
          await transaction.ownershipAttestation.findUnique({
            where: {
              sourceId_statementVersion: {
                sourceId: input.sourceId,
                statementVersion: input.statementVersion,
              },
            },
            select: { id: true },
          });
        if (existingStatement !== null) {
          throw new AttestationAlreadyExistsError();
        }

        const created = await transaction.ownershipAttestation.create({
          data: {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            sourceId: input.sourceId,
            userId: input.userId,
            statementVersion: input.statementVersion,
            authorizationBasis: input.authorizationBasis,
            createIdempotencyKey: input.idempotencyKey,
          },
          select: attestationSelection,
        });
        return { attestation: toRecord(created), replayed: false };
      });
    } catch (error: unknown) {
      if (isDomainError(error)) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.resolveConcurrentUniqueConflict(input);
      }
      throw toPersistenceError(error);
    }
  }

  private replayOrConflict(
    existing: PersistedAttestation,
    input: CreateAttestationInput,
  ): CreateAttestationRepositoryResult {
    if (!isEquivalent(existing, input)) {
      throw new AttestationIdempotencyConflictError();
    }
    return { attestation: toRecord(existing), replayed: true };
  }

  private async resolveConcurrentUniqueConflict(
    input: CreateAttestationInput,
  ): Promise<CreateAttestationRepositoryResult> {
    try {
      const existingKey = await this.prisma.ownershipAttestation.findUnique({
        where: {
          workspaceId_createIdempotencyKey: {
            workspaceId: input.workspaceId,
            createIdempotencyKey: input.idempotencyKey,
          },
        },
        select: attestationSelection,
      });
      if (existingKey !== null) {
        return this.replayOrConflict(existingKey, input);
      }

      const existingStatement =
        await this.prisma.ownershipAttestation.findUnique({
          where: {
            sourceId_statementVersion: {
              sourceId: input.sourceId,
              statementVersion: input.statementVersion,
            },
          },
          select: { id: true },
        });
      if (existingStatement !== null) {
        throw new AttestationAlreadyExistsError();
      }
      throw new AttestationPersistenceError('internal');
    } catch (error: unknown) {
      if (isDomainError(error)) {
        throw error;
      }
      throw toPersistenceError(error);
    }
  }
}
