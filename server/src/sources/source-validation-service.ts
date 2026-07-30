import { chmod, mkdtemp, open, rm, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MediaInspectionError,
  type MediaInspector,
  type SupportedMediaContentType,
} from '../media/media-inspector.js';
import {
  ObjectStorageMetadataError,
  ObjectStorageNotFoundError,
  ObjectStorageUnavailableError,
  type ObjectStorage,
} from '../storage/object-storage.js';
import { toSourceView, type SourceView } from './source-serializer.js';
import {
  SourceValidationInspectorUnavailableError,
  SourceValidationStorageUnavailableError,
  StorageRevisionUnavailableError,
} from './source-validation-errors.js';
import type {
  SourceValidationDisposition,
  SourceValidationRepository,
  SourceValidationSnapshot,
  ValidateSourceInput,
} from './source-validation-repository.js';

export const DEFAULT_MEDIA_VALIDATION_MAX_BYTES = 262_144_000;
export const DEFAULT_MEDIA_VALIDATION_DOWNLOAD_TIMEOUT_MS = 120_000;

const supportedContentTypes = new Set<SupportedMediaContentType>([
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
]);

export interface SourceValidationConfig {
  readonly maximumSizeBytes: number;
  readonly downloadTimeoutMs: number;
}

export interface SourceValidationResult {
  readonly source: SourceView;
  readonly replayed: boolean;
}

export interface SourceValidationService {
  validateSource(
    input: ValidateSourceInput,
    objectStorage: ObjectStorage,
    mediaInspector: MediaInspector,
  ): Promise<SourceValidationResult>;
}

export class DefaultSourceValidationService implements SourceValidationService {
  public constructor(
    private readonly repository: SourceValidationRepository,
    private readonly config: SourceValidationConfig = {
      maximumSizeBytes: DEFAULT_MEDIA_VALIDATION_MAX_BYTES,
      downloadTimeoutMs: DEFAULT_MEDIA_VALIDATION_DOWNLOAD_TIMEOUT_MS,
    },
  ) {
    if (
      !Number.isSafeInteger(config.maximumSizeBytes) ||
      config.maximumSizeBytes < 1 ||
      !Number.isSafeInteger(config.downloadTimeoutMs) ||
      config.downloadTimeoutMs < 1
    ) {
      throw new Error('Invalid Source validation configuration.');
    }
  }

  public async validateSource(
    input: ValidateSourceInput,
    objectStorage: ObjectStorage,
    mediaInspector: MediaInspector,
  ): Promise<SourceValidationResult> {
    const preflight = await this.repository.preflight(input);
    if (preflight.kind === 'terminal') {
      return {
        source: toSourceView(preflight.source),
        replayed: true,
      };
    }

    const disposition = await this.inspectSnapshot(
      preflight.snapshot,
      objectStorage,
      mediaInspector,
    );
    const finalized = await this.repository.finalize({
      ...input,
      storageRevision: preflight.snapshot.storageRevision,
      disposition,
    });
    return {
      source: toSourceView(finalized.source),
      replayed: finalized.replayed,
    };
  }

  private async inspectSnapshot(
    snapshot: SourceValidationSnapshot,
    objectStorage: ObjectStorage,
    mediaInspector: MediaInspector,
  ): Promise<SourceValidationDisposition> {
    const expectedContentType = this.toSupportedContentType(
      snapshot.observedContentType,
    );
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'clipai-media-validation-'),
    );
    const filePath = join(temporaryDirectory, 'confirmed-media');

    try {
      await chmod(temporaryDirectory, 0o700);
      await this.downloadSnapshot(snapshot, objectStorage, filePath);

      try {
        const inspection = await mediaInspector.inspect({
          filePath,
          expectedContentType,
        });
        if (inspection.outcome === 'rejected') {
          return { state: 'rejected', durationMs: null };
        }
        if (
          !Number.isSafeInteger(inspection.durationMs) ||
          inspection.durationMs < 1
        ) {
          throw new SourceValidationInspectorUnavailableError();
        }
        return {
          state: 'accepted',
          durationMs: BigInt(inspection.durationMs),
        };
      } catch (error: unknown) {
        if (error instanceof SourceValidationInspectorUnavailableError) {
          throw error;
        }
        if (error instanceof MediaInspectionError) {
          throw new SourceValidationInspectorUnavailableError();
        }
        throw new SourceValidationInspectorUnavailableError();
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private async downloadSnapshot(
    snapshot: SourceValidationSnapshot,
    objectStorage: ObjectStorage,
    filePath: string,
  ): Promise<void> {
    const deadline = Date.now() + this.config.downloadTimeoutMs;

    try {
      const object = await this.withDeadline(
        objectStorage.readConfirmedObject({
          objectKey: snapshot.objectKey,
          storageRevision: snapshot.storageRevision,
          expectedSizeBytes: snapshot.observedSizeBytes,
          maximumSizeBytes: this.config.maximumSizeBytes,
          timeoutMilliseconds: this.config.downloadTimeoutMs,
        }),
        deadline,
      );
      if (
        object.sizeBytes !== snapshot.observedSizeBytes ||
        object.sizeBytes > this.config.maximumSizeBytes
      ) {
        throw new StorageRevisionUnavailableError();
      }

      const file = await open(filePath, 'wx', 0o600);
      try {
        await this.writeStreamToFile(
          object.body,
          file,
          snapshot.observedSizeBytes,
          deadline,
        );
      } finally {
        await file.close();
      }
    } catch (error: unknown) {
      if (error instanceof StorageRevisionUnavailableError) {
        throw error;
      }
      if (
        error instanceof ObjectStorageNotFoundError ||
        error instanceof ObjectStorageMetadataError
      ) {
        throw new StorageRevisionUnavailableError();
      }
      if (error instanceof ObjectStorageUnavailableError) {
        throw new SourceValidationStorageUnavailableError();
      }
      if (error instanceof DownloadTimeoutError) {
        throw new SourceValidationStorageUnavailableError();
      }
      throw new SourceValidationStorageUnavailableError();
    }
  }

  private async writeStreamToFile(
    body: AsyncIterable<Uint8Array>,
    file: FileHandle,
    expectedSizeBytes: number,
    deadline: number,
  ): Promise<void> {
    const iterator = body[Symbol.asyncIterator]();
    let written = 0;

    try {
      while (true) {
        const next = await this.withDeadline(iterator.next(), deadline);
        if (next.done === true) {
          break;
        }
        if (!(next.value instanceof Uint8Array)) {
          throw new StorageRevisionUnavailableError();
        }

        written += next.value.byteLength;
        if (
          written > expectedSizeBytes ||
          written > this.config.maximumSizeBytes
        ) {
          throw new StorageRevisionUnavailableError();
        }
        await this.writeAll(file, next.value, deadline);
      }
    } finally {
      if (iterator.return !== undefined) {
        try {
          await this.withDeadline(iterator.return(), deadline);
        } catch {
          // The private temporary file is removed by the outer finally block.
        }
      }
    }

    if (written !== expectedSizeBytes) {
      throw new StorageRevisionUnavailableError();
    }
  }

  private async writeAll(
    file: FileHandle,
    chunk: Uint8Array,
    deadline: number,
  ): Promise<void> {
    let offset = 0;
    while (offset < chunk.byteLength) {
      const result = await this.withDeadline(
        file.write(chunk, offset, chunk.byteLength - offset),
        deadline,
      );
      if (result.bytesWritten < 1) {
        throw new SourceValidationStorageUnavailableError();
      }
      offset += result.bytesWritten;
    }
  }

  private async withDeadline<T>(
    operation: Promise<T>,
    deadline: number,
  ): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new DownloadTimeoutError();
    }

    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new DownloadTimeoutError()),
            remaining,
          );
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  private toSupportedContentType(
    contentType: string,
  ): SupportedMediaContentType {
    if (!supportedContentTypes.has(contentType as SupportedMediaContentType)) {
      throw new StorageRevisionUnavailableError();
    }
    return contentType as SupportedMediaContentType;
  }
}

class DownloadTimeoutError extends Error {
  public constructor() {
    super('Media download timed out.');
    this.name = 'DownloadTimeoutError';
  }
}
