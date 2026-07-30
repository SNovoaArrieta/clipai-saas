import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { isPersistenceUnavailable } from '../database/database-errors.js';
import { OWNERSHIP_STATEMENT_VERSION } from '../attestations/ownership-statement-registry.js';
import {
  SourceNotReadyForValidationError,
  SourceValidationPersistenceError,
  SourceValidationProjectArchivedError,
  SourceValidationProjectNotFoundError,
  SourceValidationSourceNotFoundError,
  StorageRevisionUnavailableError,
} from './source-validation-errors.js';
import type {
  FinalizeSourceValidationInput,
  SourceValidationDisposition,
  SourceValidationFinalization,
  SourceValidationPreflight,
  SourceValidationRepository,
  SourceValidationSnapshot,
  ValidateSourceInput,
} from './source-validation-repository.js';

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

const validationSourceSelection = {
  ...sourceSelection,
  workspaceId: true,
  archivedAt: true,
} as const;

const uploadSelection = {
  sourceId: true,
  workspaceId: true,
  projectId: true,
  objectKey: true,
  observedSizeBytes: true,
  observedContentType: true,
  completedAt: true,
  storageRevision: true,
} as const;

type Transaction = Prisma.TransactionClient;

function toPersistenceError(error: unknown): SourceValidationPersistenceError {
  return new SourceValidationPersistenceError(
    isPersistenceUnavailable(error) ? 'unavailable' : 'internal',
  );
}

function isDomainError(error: unknown): boolean {
  return (
    error instanceof SourceValidationProjectNotFoundError ||
    error instanceof SourceValidationProjectArchivedError ||
    error instanceof SourceValidationSourceNotFoundError ||
    error instanceof SourceNotReadyForValidationError ||
    error instanceof StorageRevisionUnavailableError ||
    error instanceof SourceValidationPersistenceError
  );
}

export class PrismaSourceValidationRepository implements SourceValidationRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async preflight(
    input: ValidateSourceInput,
  ): Promise<SourceValidationPreflight> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.lockProject(transaction, input);
        const source = await this.lockAndReadSource(transaction, input);

        this.assertSourceIsVisibleAndInactive(source);
        if (source.state === 'accepted' || source.state === 'rejected') {
          return { kind: 'terminal', source };
        }
        if (source.state !== 'validating') {
          throw new SourceNotReadyForValidationError();
        }

        const upload = await this.lockAndReadUpload(transaction, input);
        const snapshot = this.toSnapshot(upload);
        await this.assertCurrentAttestationExists(transaction, input);
        return { kind: 'ready', snapshot };
      });
    } catch (error: unknown) {
      if (isDomainError(error)) {
        throw error;
      }
      throw toPersistenceError(error);
    }
  }

  public async finalize(
    input: FinalizeSourceValidationInput,
  ): Promise<SourceValidationFinalization> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.lockProject(transaction, input);
        const source = await this.lockAndReadSource(transaction, input);

        this.assertSourceIsVisibleAndInactive(source);
        if (source.state === 'accepted' || source.state === 'rejected') {
          return { source, replayed: true };
        }
        if (source.state !== 'validating') {
          throw new SourceNotReadyForValidationError();
        }

        const upload = await this.lockAndReadUpload(transaction, input);
        this.assertUploadMatchesInspectedRevision(
          upload,
          input.storageRevision,
        );
        await this.assertCurrentAttestationExists(transaction, input);

        const updated = await transaction.source.updateMany({
          where: {
            id: input.sourceId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            state: 'validating',
            isActive: false,
            archivedAt: null,
            uploadIntent: {
              is: {
                sourceId: input.sourceId,
                workspaceId: input.workspaceId,
                projectId: input.projectId,
                completedAt: { not: null },
                storageRevision: input.storageRevision,
              },
            },
          },
          data: this.toSourceUpdate(input.disposition),
        });

        if (updated.count === 1) {
          const finalized = await transaction.source.findFirst({
            where: {
              id: input.sourceId,
              workspaceId: input.workspaceId,
              projectId: input.projectId,
            },
            select: sourceSelection,
          });
          if (finalized === null) {
            throw new SourceValidationPersistenceError('internal');
          }
          return { source: finalized, replayed: false };
        }

        const replayed = await this.resolveFailedCas(
          transaction,
          input,
          input.storageRevision,
        );
        return { source: replayed, replayed: true };
      });
    } catch (error: unknown) {
      if (isDomainError(error)) {
        throw error;
      }
      throw toPersistenceError(error);
    }
  }

  private async lockProject(
    transaction: Transaction,
    input: ValidateSourceInput,
  ): Promise<void> {
    const projects = await transaction.$queryRaw<
      {
        readonly state: 'draft' | 'active' | 'archived';
        archivedAt: Date | null;
      }[]
    >`
      SELECT "state", "archivedAt"
      FROM "Project"
      WHERE "id" = ${input.projectId}::uuid
        AND "workspaceId" = ${input.workspaceId}::uuid
      FOR UPDATE
    `;
    const project = projects[0];
    if (project === undefined) {
      throw new SourceValidationProjectNotFoundError();
    }
    if (project.state === 'archived' || project.archivedAt !== null) {
      throw new SourceValidationProjectArchivedError();
    }
  }

  private async lockAndReadSource(
    transaction: Transaction,
    input: ValidateSourceInput,
  ) {
    const locked = await transaction.$queryRaw<{ readonly id: string }[]>`
      SELECT "id"
      FROM "Source"
      WHERE "id" = ${input.sourceId}::uuid
        AND "workspaceId" = ${input.workspaceId}::uuid
        AND "projectId" = ${input.projectId}::uuid
      FOR UPDATE
    `;
    if (locked[0] === undefined) {
      throw new SourceValidationSourceNotFoundError();
    }

    const source = await transaction.source.findFirst({
      where: {
        id: input.sourceId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      },
      select: validationSourceSelection,
    });
    if (source === null) {
      throw new SourceValidationPersistenceError('internal');
    }
    return source;
  }

  private async lockAndReadUpload(
    transaction: Transaction,
    input: ValidateSourceInput,
  ) {
    const locked = await transaction.$queryRaw<{ readonly id: string }[]>`
      SELECT "id"
      FROM "UploadIntent"
      WHERE "sourceId" = ${input.sourceId}::uuid
        AND "workspaceId" = ${input.workspaceId}::uuid
        AND "projectId" = ${input.projectId}::uuid
      FOR UPDATE
    `;
    if (locked[0] === undefined) {
      throw new SourceNotReadyForValidationError();
    }

    const upload = await transaction.uploadIntent.findFirst({
      where: {
        sourceId: input.sourceId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      },
      select: uploadSelection,
    });
    if (upload === null) {
      throw new SourceValidationPersistenceError('internal');
    }
    return upload;
  }

  private assertSourceIsVisibleAndInactive(source: {
    readonly sourceType: 'upload';
    readonly isActive: boolean;
    readonly archivedAt: Date | null;
  }): void {
    if (source.archivedAt !== null) {
      throw new SourceValidationSourceNotFoundError();
    }
    if (source.sourceType !== 'upload' || source.isActive) {
      throw new SourceNotReadyForValidationError();
    }
  }

  private toSnapshot(upload: {
    readonly objectKey: string;
    readonly observedSizeBytes: bigint | null;
    readonly observedContentType: string | null;
    readonly completedAt: Date | null;
    readonly storageRevision: string | null;
  }): SourceValidationSnapshot {
    if (upload.completedAt === null) {
      throw new SourceNotReadyForValidationError();
    }
    if (upload.storageRevision === null) {
      throw new StorageRevisionUnavailableError();
    }
    if (upload.observedContentType === null) {
      throw new SourceNotReadyForValidationError();
    }

    const observedSizeBytes =
      upload.observedSizeBytes === null
        ? Number.NaN
        : Number(upload.observedSizeBytes);
    if (!Number.isSafeInteger(observedSizeBytes) || observedSizeBytes < 1) {
      throw new StorageRevisionUnavailableError();
    }
    return {
      objectKey: upload.objectKey,
      storageRevision: upload.storageRevision,
      observedSizeBytes,
      observedContentType: upload.observedContentType,
    };
  }

  private assertUploadMatchesInspectedRevision(
    upload: {
      readonly completedAt: Date | null;
      readonly storageRevision: string | null;
    },
    storageRevision: string,
  ): void {
    if (
      upload.completedAt === null ||
      upload.storageRevision !== storageRevision
    ) {
      throw new StorageRevisionUnavailableError();
    }
  }

  private async assertCurrentAttestationExists(
    transaction: Transaction,
    input: ValidateSourceInput,
  ): Promise<void> {
    const attestation = await transaction.ownershipAttestation.findUnique({
      where: {
        sourceId_statementVersion: {
          sourceId: input.sourceId,
          statementVersion: OWNERSHIP_STATEMENT_VERSION,
        },
      },
      select: {
        workspaceId: true,
        projectId: true,
      },
    });
    if (
      attestation === null ||
      attestation.workspaceId !== input.workspaceId ||
      attestation.projectId !== input.projectId
    ) {
      throw new SourceNotReadyForValidationError();
    }
  }

  private toSourceUpdate(disposition: SourceValidationDisposition) {
    return disposition.state === 'accepted'
      ? {
          state: 'accepted' as const,
          durationMs: disposition.durationMs,
        }
      : {
          state: 'rejected' as const,
          durationMs: null,
        };
  }

  private async resolveFailedCas(
    transaction: Transaction,
    input: ValidateSourceInput,
    storageRevision: string,
  ) {
    const source = await transaction.source.findFirst({
      where: {
        id: input.sourceId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      },
      select: validationSourceSelection,
    });
    if (source === null || source.archivedAt !== null) {
      throw new SourceValidationSourceNotFoundError();
    }
    if (source.state === 'accepted' || source.state === 'rejected') {
      return source;
    }
    if (source.state !== 'validating' || source.isActive) {
      throw new SourceNotReadyForValidationError();
    }

    const upload = await transaction.uploadIntent.findFirst({
      where: {
        sourceId: input.sourceId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      },
      select: uploadSelection,
    });
    if (
      upload === null ||
      upload.completedAt === null ||
      upload.storageRevision !== storageRevision
    ) {
      throw new StorageRevisionUnavailableError();
    }
    throw new SourceValidationPersistenceError('internal');
  }
}
