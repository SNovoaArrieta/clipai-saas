export class SourceValidationProjectNotFoundError extends Error {
  public constructor() {
    super('Project was not found.');
    this.name = 'SourceValidationProjectNotFoundError';
  }
}

export class SourceValidationProjectArchivedError extends Error {
  public constructor() {
    super('Project is archived.');
    this.name = 'SourceValidationProjectArchivedError';
  }
}

export class SourceValidationSourceNotFoundError extends Error {
  public constructor() {
    super('Source was not found.');
    this.name = 'SourceValidationSourceNotFoundError';
  }
}

export class SourceNotReadyForValidationError extends Error {
  public constructor() {
    super('Source is not ready for validation.');
    this.name = 'SourceNotReadyForValidationError';
  }
}

export class StorageRevisionUnavailableError extends Error {
  public constructor() {
    super('The confirmed storage revision is unavailable.');
    this.name = 'StorageRevisionUnavailableError';
  }
}

export class SourceValidationStorageUnavailableError extends Error {
  public constructor() {
    super('Object storage is temporarily unavailable.');
    this.name = 'SourceValidationStorageUnavailableError';
  }
}

export class SourceValidationInspectorUnavailableError extends Error {
  public constructor() {
    super('Media inspection is temporarily unavailable.');
    this.name = 'SourceValidationInspectorUnavailableError';
  }
}

export type SourceValidationPersistenceFailure = 'unavailable' | 'internal';

export class SourceValidationPersistenceError extends Error {
  public constructor(
    public readonly failure: SourceValidationPersistenceFailure,
  ) {
    super('Source validation persistence failed.');
    this.name = 'SourceValidationPersistenceError';
  }
}

export class SourceValidationDownloadError extends Error {
  public constructor() {
    super('Confirmed media could not be downloaded safely.');
    this.name = 'SourceValidationDownloadError';
  }
}
