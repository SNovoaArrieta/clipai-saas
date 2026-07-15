export class AttestationProjectNotFoundError extends Error {
  public constructor() {
    super('Project was not found.');
    this.name = 'AttestationProjectNotFoundError';
  }
}

export class AttestationProjectArchivedError extends Error {
  public constructor() {
    super('Project is archived.');
    this.name = 'AttestationProjectArchivedError';
  }
}

export class AttestationSourceNotFoundError extends Error {
  public constructor() {
    super('Source was not found.');
    this.name = 'AttestationSourceNotFoundError';
  }
}

export class SourceNotReadyForAttestationError extends Error {
  public constructor() {
    super('Source is not ready for attestation.');
    this.name = 'SourceNotReadyForAttestationError';
  }
}

export class AttestationIdempotencyConflictError extends Error {
  public constructor() {
    super('Attestation idempotency conflict.');
    this.name = 'AttestationIdempotencyConflictError';
  }
}

export class AttestationAlreadyExistsError extends Error {
  public constructor() {
    super('Attestation already exists.');
    this.name = 'AttestationAlreadyExistsError';
  }
}

export type AttestationPersistenceFailure = 'unavailable' | 'internal';

export class AttestationPersistenceError extends Error {
  public constructor(public readonly failure: AttestationPersistenceFailure) {
    super('Attestation persistence failed.');
    this.name = 'AttestationPersistenceError';
  }
}
