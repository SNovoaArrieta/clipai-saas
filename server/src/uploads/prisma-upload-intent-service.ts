import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { isPersistenceUnavailable } from '../database/database-errors.js';
import type { ObjectStorage, UploadTarget } from '../storage/object-storage.js';
import {
  UPLOAD_MAX_SIZE_BYTES,
  UPLOAD_TARGET_TTL_MILLISECONDS,
  UploadIdempotencyConflictError,
  UploadPersistenceError,
  UploadProjectArchivedError,
  UploadProjectNotFoundError,
  toUploadIntentView,
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
  source: {
    select: {
      id: true,
      sourceType: true,
      state: true,
      safeReference: true,
      durationMs: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
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
  readonly source: {
    readonly id: string;
    readonly sourceType: 'upload';
    readonly state: 'submitted' | 'validating' | 'accepted' | 'rejected';
    readonly safeReference: string;
    readonly durationMs: bigint | null;
    readonly isActive: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
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
    objectKey: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<UploadTarget> {
    return objectStorage.createUploadTarget({
      objectKey,
      contentType,
      sizeBytes,
      expiresAt: new Date(Date.now() + UPLOAD_TARGET_TTL_MILLISECONDS),
    });
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
