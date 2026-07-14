import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { isPersistenceUnavailable } from '../database/database-errors.js';
import {
  ObjectStorageMetadataError,
  ObjectStorageNotFoundError,
  type ObjectStorage,
  type UploadedObjectMetadata,
  type UploadTarget,
} from '../storage/object-storage.js';
import {
  UPLOAD_MAX_SIZE_BYTES,
  UPLOAD_TARGET_TTL_MILLISECONDS,
  UploadIdempotencyConflictError,
  UploadIntentNotFoundError,
  UploadMetadataMismatchError,
  UploadNotCompletedError,
  UploadPersistenceError,
  UploadProjectArchivedError,
  UploadProjectNotFoundError,
  toUploadIntentView,
  type ConfirmUploadIntentInput,
  type ConfirmUploadIntentResult,
  type CreateUploadIntentInput,
  type CreateUploadIntentResult,
  type UploadIntentService,
  type UploadSourceView,
} from './upload-intent-service.js';

const persistedUploadSelection = {
  id: true,
  workspaceId: true,
  projectId: true,
  sourceId: true,
  objectKey: true,
  declaredContentType: true,
  declaredSizeBytes: true,
  originalFilename: true,
  expiresAt: true,
  observedSizeBytes: true,
  observedContentType: true,
  storageEtag: true,
  completedAt: true,
  source: {
    select: {
      id: true,
      sourceType: true,
      state: true,
      safeReference: true,
      durationMs: true,
      isActive: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      project: {
        select: {
          state: true,
          archivedAt: true,
        },
      },
    },
  },
} as const;

type PersistedUpload = {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly objectKey: string;
  readonly declaredContentType: string;
  readonly declaredSizeBytes: bigint;
  readonly originalFilename: string;
  readonly expiresAt: Date;
  readonly observedSizeBytes: bigint | null;
  readonly observedContentType: string | null;
  readonly storageEtag: string | null;
  readonly completedAt: Date | null;
  readonly source: {
    readonly id: string;
    readonly sourceType: 'upload';
    readonly state: 'submitted' | 'validating' | 'accepted' | 'rejected';
    readonly safeReference: string;
    readonly durationMs: bigint | null;
    readonly isActive: boolean;
    readonly archivedAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly project: {
      readonly state: 'draft' | 'active' | 'archived';
      readonly archivedAt: Date | null;
    };
  };
};

function toPersistenceError(error: unknown): UploadPersistenceError {
  return new UploadPersistenceError(
    isPersistenceUnavailable(error) ? 'unavailable' : 'internal',
  );
}

function toSourceView(source: PersistedUpload['source']): UploadSourceView {
  if (
    source.sourceType !== 'upload' ||
    source.state !== 'submitted' ||
    source.durationMs !== null ||
    source.isActive
  ) {
    throw new UploadPersistenceError('internal');
  }

  return {
    id: source.id,
    sourceType: 'upload',
    state: 'submitted',
    safeReference: source.safeReference,
    durationMs: null,
    isActive: false,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function isEquivalent(
  upload: PersistedUpload,
  input: CreateUploadIntentInput,
): boolean {
  return (
    upload.originalFilename === input.filename &&
    upload.declaredContentType === input.contentType &&
    upload.declaredSizeBytes === BigInt(input.sizeBytes)
  );
}

function getFileExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase();
}

interface VerifiedUploadObservation {
  readonly sizeBytes: bigint;
  readonly contentType: string;
  readonly etag: string | null;
}

function verifyUploadedObject(
  upload: PersistedUpload,
  metadata: UploadedObjectMetadata,
): VerifiedUploadObservation {
  const contentType = metadata.contentType?.trim().toLowerCase();
  const uploadIntentMetadata = Object.entries(metadata.metadata).filter(
    ([key]) => key.toLowerCase() === 'upload-intent-id',
  );
  const etag = metadata.etag?.trim() || null;

  if (
    !Number.isSafeInteger(metadata.sizeBytes) ||
    metadata.sizeBytes < 1 ||
    metadata.sizeBytes > UPLOAD_MAX_SIZE_BYTES ||
    BigInt(metadata.sizeBytes) !== upload.declaredSizeBytes ||
    contentType === undefined ||
    contentType.includes(';') ||
    contentType !== upload.declaredContentType ||
    uploadIntentMetadata.length !== 1 ||
    uploadIntentMetadata[0]?.[1] !== upload.id ||
    (etag !== null && (etag.length > 255 || controlCharacterPattern.test(etag)))
  ) {
    throw new UploadMetadataMismatchError();
  }

  return {
    sizeBytes: BigInt(metadata.sizeBytes),
    contentType,
    etag,
  };
}

const controlCharacterPattern = /\p{Cc}/u;

export class PrismaUploadIntentService implements UploadIntentService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createUploadIntent(
    input: CreateUploadIntentInput,
    objectStorage: ObjectStorage,
  ): Promise<CreateUploadIntentResult> {
    await this.assertProjectCanReceiveUpload(input);

    const existing = await this.findByIdempotencyKey(input);
    if (existing !== null) {
      return this.replay(existing, input, objectStorage);
    }

    const uploadIntentId = randomUUID();
    const sourceId = randomUUID();
    const objectKey = `uploads/${uploadIntentId}/${randomUUID()}${getFileExtension(input.filename)}`;
    const target = await this.createTarget(
      objectStorage,
      uploadIntentId,
      objectKey,
      input.contentType,
      input.sizeBytes,
    );

    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        await transaction.source.create({
          data: {
            id: sourceId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            safeReference: input.filename,
          },
        });

        return transaction.uploadIntent.create({
          data: {
            id: uploadIntentId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            sourceId,
            objectKey,
            declaredContentType: input.contentType,
            declaredSizeBytes: BigInt(input.sizeBytes),
            originalFilename: input.filename,
            expiresAt: target.expiresAt,
            createIdempotencyKey: input.idempotencyKey,
          },
          select: persistedUploadSelection,
        });
      });

      return this.toResult(created, target, false);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.findByIdempotencyKey(input);
        if (concurrent !== null) {
          return this.replay(concurrent, input, objectStorage);
        }
      }

      throw toPersistenceError(error);
    }
  }

  public async confirmUploadIntent(
    input: ConfirmUploadIntentInput,
    objectStorage: ObjectStorage,
  ): Promise<ConfirmUploadIntentResult> {
    const upload = await this.findForConfirmation(input);
    this.assertConfirmationProjectIsActive(upload);

    if (upload.completedAt !== null) {
      return this.toConfirmationResult(upload, true);
    }

    this.assertPendingSourceCanBeConfirmed(upload);

    let metadata: UploadedObjectMetadata;
    try {
      metadata = await objectStorage.inspectUploadedObject({
        objectKey: upload.objectKey,
      });
    } catch (error: unknown) {
      if (error instanceof ObjectStorageNotFoundError) {
        throw new UploadNotCompletedError();
      }

      if (error instanceof ObjectStorageMetadataError) {
        throw new UploadMetadataMismatchError();
      }

      throw error;
    }

    const observation = verifyUploadedObject(upload, metadata);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.uploadIntent.findFirst({
          where: {
            id: input.uploadHandle,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
          },
          select: persistedUploadSelection,
        });

        if (current === null) {
          throw new UploadIntentNotFoundError();
        }

        this.assertConfirmationProjectIsActive(current);
        if (current.completedAt !== null) {
          return this.toConfirmationResult(current, true);
        }

        this.assertPendingSourceCanBeConfirmed(current);

        const completedAt = new Date();
        const claimed = await transaction.uploadIntent.updateMany({
          where: {
            id: current.id,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            completedAt: null,
          },
          data: {
            observedSizeBytes: observation.sizeBytes,
            observedContentType: observation.contentType,
            storageEtag: observation.etag,
            completedAt,
          },
        });

        if (claimed.count === 0) {
          const replayed = await transaction.uploadIntent.findFirst({
            where: {
              id: input.uploadHandle,
              workspaceId: input.workspaceId,
              projectId: input.projectId,
            },
            select: persistedUploadSelection,
          });

          if (replayed === null) {
            throw new UploadIntentNotFoundError();
          }

          return this.toConfirmationResult(replayed, true);
        }

        const advanced = await transaction.source.updateMany({
          where: {
            id: current.sourceId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            state: 'submitted',
            isActive: false,
            durationMs: null,
            archivedAt: null,
          },
          data: { state: 'validating' },
        });

        if (advanced.count !== 1) {
          throw new UploadPersistenceError('internal');
        }

        const confirmed = await transaction.uploadIntent.findFirst({
          where: {
            id: current.id,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
          },
          select: persistedUploadSelection,
        });

        if (confirmed === null) {
          throw new UploadPersistenceError('internal');
        }

        return this.toConfirmationResult(confirmed, false);
      });
    } catch (error: unknown) {
      if (
        error instanceof UploadIntentNotFoundError ||
        error instanceof UploadProjectArchivedError ||
        error instanceof UploadPersistenceError
      ) {
        throw error;
      }

      throw toPersistenceError(error);
    }
  }

  private async assertProjectCanReceiveUpload(
    input: CreateUploadIntentInput,
  ): Promise<void> {
    try {
      const project = await this.prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: input.workspaceId },
        select: { state: true, archivedAt: true },
      });

      if (project === null) {
        throw new UploadProjectNotFoundError();
      }

      if (project.state === 'archived' || project.archivedAt !== null) {
        throw new UploadProjectArchivedError();
      }
    } catch (error: unknown) {
      if (
        error instanceof UploadProjectNotFoundError ||
        error instanceof UploadProjectArchivedError
      ) {
        throw error;
      }

      throw toPersistenceError(error);
    }
  }

  private async findByIdempotencyKey(
    input: CreateUploadIntentInput,
  ): Promise<PersistedUpload | null> {
    try {
      return await this.prisma.uploadIntent.findUnique({
        where: {
          workspaceId_projectId_createIdempotencyKey: {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            createIdempotencyKey: input.idempotencyKey,
          },
        },
        select: persistedUploadSelection,
      });
    } catch (error: unknown) {
      throw toPersistenceError(error);
    }
  }

  private async replay(
    upload: PersistedUpload,
    input: CreateUploadIntentInput,
    objectStorage: ObjectStorage,
  ): Promise<CreateUploadIntentResult> {
    if (!isEquivalent(upload, input)) {
      throw new UploadIdempotencyConflictError();
    }

    const target = await this.createTarget(
      objectStorage,
      upload.id,
      upload.objectKey,
      upload.declaredContentType,
      Number(upload.declaredSizeBytes),
    );

    try {
      const refreshed = await this.prisma.uploadIntent.update({
        where: {
          id: upload.id,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        },
        data: { expiresAt: target.expiresAt },
        select: persistedUploadSelection,
      });

      return this.toResult(refreshed, target, true);
    } catch (error: unknown) {
      throw toPersistenceError(error);
    }
  }

  private createTarget(
    objectStorage: ObjectStorage,
    uploadIntentId: string,
    objectKey: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<UploadTarget> {
    return objectStorage.createUploadTarget({
      uploadIntentId,
      objectKey,
      contentType,
      sizeBytes,
      expiresAt: new Date(Date.now() + UPLOAD_TARGET_TTL_MILLISECONDS),
    });
  }

  private async findForConfirmation(
    input: ConfirmUploadIntentInput,
  ): Promise<PersistedUpload> {
    try {
      const upload = await this.prisma.uploadIntent.findFirst({
        where: {
          id: input.uploadHandle,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        },
        select: persistedUploadSelection,
      });

      if (upload === null) {
        throw new UploadIntentNotFoundError();
      }

      return upload;
    } catch (error: unknown) {
      if (error instanceof UploadIntentNotFoundError) {
        throw error;
      }

      throw toPersistenceError(error);
    }
  }

  private assertConfirmationProjectIsActive(upload: PersistedUpload): void {
    if (
      upload.source.project.state === 'archived' ||
      upload.source.project.archivedAt !== null
    ) {
      throw new UploadProjectArchivedError();
    }
  }

  private assertPendingSourceCanBeConfirmed(upload: PersistedUpload): void {
    if (
      upload.source.state !== 'submitted' ||
      upload.source.isActive ||
      upload.source.durationMs !== null ||
      upload.source.archivedAt !== null
    ) {
      throw new UploadPersistenceError('internal');
    }
  }

  private toConfirmationResult(
    upload: PersistedUpload,
    replayed: boolean,
  ): ConfirmUploadIntentResult {
    if (
      upload.completedAt === null ||
      upload.observedSizeBytes === null ||
      upload.observedContentType === null ||
      upload.observedSizeBytes < 1n ||
      upload.observedSizeBytes > BigInt(UPLOAD_MAX_SIZE_BYTES) ||
      upload.source.sourceType !== 'upload' ||
      upload.source.state !== 'validating' ||
      upload.source.durationMs !== null ||
      upload.source.isActive ||
      upload.source.archivedAt !== null
    ) {
      throw new UploadPersistenceError('internal');
    }

    return {
      source: {
        id: upload.source.id,
        sourceType: 'upload',
        state: 'validating',
        safeReference: upload.source.safeReference,
        durationMs: null,
        isActive: false,
        createdAt: upload.source.createdAt.toISOString(),
        updatedAt: upload.source.updatedAt.toISOString(),
      },
      upload: {
        handle: upload.id,
        status: 'completed',
        sizeBytes: Number(upload.observedSizeBytes),
        contentType: upload.observedContentType,
        completedAt: upload.completedAt.toISOString(),
      },
      replayed,
    };
  }

  private toResult(
    upload: PersistedUpload,
    target: UploadTarget,
    replayed: boolean,
  ): CreateUploadIntentResult {
    if (upload.declaredSizeBytes > BigInt(UPLOAD_MAX_SIZE_BYTES)) {
      throw new UploadPersistenceError('internal');
    }

    return {
      source: toSourceView(upload.source),
      upload: toUploadIntentView(upload.id, target),
      replayed,
    };
  }
}
