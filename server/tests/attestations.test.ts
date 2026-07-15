import request from 'supertest';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../src/app.js';
import {
  AttestationAlreadyExistsError,
  AttestationIdempotencyConflictError,
  AttestationProjectArchivedError,
  AttestationProjectNotFoundError,
  AttestationSourceNotFoundError,
  SourceNotReadyForAttestationError,
} from '../src/attestations/attestation-errors.js';
import { assertSourceReadyForAttestation } from '../src/attestations/attestation-policy.js';
import type { AttestationRepository } from '../src/attestations/attestation-repository.js';
import {
  DefaultAttestationService,
  type AttestationService,
} from '../src/attestations/attestation-service.js';
import {
  OWNERSHIP_STATEMENTS,
  OWNERSHIP_STATEMENT_VERSION,
} from '../src/attestations/ownership-statement-registry.js';
import {
  AttestationInputValidationError,
  parseAttestationRequest,
} from '../src/attestations/attestation-validator.js';
import type { IdentityVerifier } from '../src/identity/identity-verifier.js';
import type { IdentityProvisioner } from '../src/provisioning/identity-provisioner.js';

const userId = '0a2ae619-85a6-4571-bccd-3e882cbd2fc8';
const workspaceId = '3ad971a4-79a2-4a3a-9d15-0c9220d31955';
const projectId = '9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482';
const sourceId = '7f78db17-78ce-49d1-bba7-f02ebbc31d3a';
const attestationId = '5f78db17-78ce-49d1-bba7-f02ebbc31d38';
const authorization = 'Bearer verified-attestation-token';
const idempotencyKey = 'attestation:create:0001';
const validBody = {
  accepted: true,
  statementVersion: 'ownership-v1',
  authorizationBasis: 'owner',
} as const;

function createAttestationService(
  overrides: Partial<AttestationService> = {},
): AttestationService {
  return {
    createAttestation: vi.fn(async (input) => ({
      attestation: {
        id: attestationId,
        sourceId: input.sourceId,
        statementVersion: input.statementVersion,
        authorizationBasis: input.authorizationBasis,
        attestedAt: '2026-07-15T18:00:00.000Z',
      },
      replayed: false,
    })),
    ...overrides,
  };
}

function createDependencies(
  attestationService?: AttestationService,
): AppDependencies {
  const identityVerifier: IdentityVerifier = {
    verifyAccessToken: vi.fn(async () => ({
      authSubject: '5e85dcbb-e70a-4744-981b-a4fa96a230b1',
      email: 'private@example.com',
    })),
  };
  const identityProvisioner: IdentityProvisioner = {
    provision: vi.fn(async () => ({
      user: { id: userId, email: 'private@example.com' },
      workspace: { id: workspaceId },
    })),
  };
  return {
    identityVerifier,
    identityProvisioner,
    ...(attestationService === undefined ? {} : { attestationService }),
  };
}

function attestationPath(project = projectId, source = sourceId): string {
  return `/api/v1/projects/${project}/sources/${source}/attestations`;
}

function postAttestation(
  dependencies: AppDependencies,
  options: {
    body?: unknown;
    key?: string;
    path?: string;
    authenticated?: boolean;
  } = {},
) {
  let call = request(createApp(dependencies)).post(
    options.path ?? attestationPath(),
  );
  if (options.authenticated !== false) {
    call = call.set('Authorization', authorization);
  }
  if (options.key !== undefined) {
    call = call.set('Idempotency-Key', options.key);
  }
  if ('body' in options) {
    if (
      options.body === null ||
      (typeof options.body !== 'object' && options.body !== undefined)
    ) {
      call = call
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(options.body));
    } else {
      call = call.send(options.body as object | undefined);
    }
  }
  return call;
}

describe('OwnershipAttestation HTTP contract', () => {
  it('requires authentication before service access', async () => {
    const service = createAttestationService();
    const response = await postAttestation(createDependencies(service), {
      authenticated: false,
      key: idempotencyKey,
      body: validBody,
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(service.createAttestation).not.toHaveBeenCalled();
  });

  it.each([
    attestationPath('invalid', sourceId),
    attestationPath(projectId, 'invalid'),
  ])('rejects an invalid path ID as invalid input', async (path) => {
    const service = createAttestationService();
    const response = await postAttestation(createDependencies(service), {
      path,
      key: idempotencyKey,
      body: validBody,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ATTESTATION_INPUT_INVALID');
    expect(service.createAttestation).not.toHaveBeenCalled();
  });

  it('requires Idempotency-Key', async () => {
    const response = await postAttestation(
      createDependencies(createAttestationService()),
      { body: validBody },
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it.each(['', 'short', 'contains space', 'x'.repeat(256)])(
    'rejects invalid Idempotency-Key %s',
    async (key) => {
      const response = await postAttestation(
        createDependencies(createAttestationService()),
        { body: validBody, key },
      );
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('ATTESTATION_INPUT_INVALID');
    },
  );

  it.each([
    ['absent', undefined, false],
    ['array', [], true],
    ['null', null, true],
    ['string', 'value', true],
    ['number', 1, true],
    ['boolean', true, true],
  ])('rejects %s body', async (_label, body, includeBody) => {
    const options = includeBody
      ? { body, key: idempotencyKey }
      : { key: idempotencyKey };
    const response = await postAttestation(
      createDependencies(createAttestationService()),
      options,
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ATTESTATION_INPUT_INVALID');
  });

  it.each([
    ['accepted absent', { ...validBody, accepted: undefined }],
    ['accepted false', { ...validBody, accepted: false }],
    ['accepted string', { ...validBody, accepted: 'true' }],
    ['accepted number', { ...validBody, accepted: 1 }],
    ['accepted null', { ...validBody, accepted: null }],
    [
      'statementVersion absent',
      { accepted: true, authorizationBasis: 'owner' },
    ],
    ['unknown statementVersion', { ...validBody, statementVersion: 'v2' }],
    [
      'authorizationBasis absent',
      { accepted: true, statementVersion: 'ownership-v1' },
    ],
    [
      'unknown authorizationBasis',
      { ...validBody, authorizationBasis: 'admin' },
    ],
    ['unknown field', { ...validBody, statementText: 'controlled' }],
    ['workspace field', { ...validBody, workspaceId }],
    ['user field', { ...validBody, userId }],
  ])('rejects %s', async (_label, body) => {
    const response = await postAttestation(
      createDependencies(createAttestationService()),
      { body, key: idempotencyKey },
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ATTESTATION_INPUT_INVALID');
  });

  it('rejects malformed JSON with the attestation error contract', async () => {
    const response = await request(
      createApp(createDependencies(createAttestationService())),
    )
      .post(attestationPath())
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .set('Content-Type', 'application/json')
      .send('{invalid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ATTESTATION_INPUT_INVALID');
  });

  it('rejects duplicate top-level JSON fields', async () => {
    const service = createAttestationService();
    const response = await request(createApp(createDependencies(service)))
      .post(attestationPath())
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .set('Content-Type', 'application/json')
      .send(
        '{"accepted":false,"accepted":true,"statementVersion":"ownership-v1","authorizationBasis":"owner"}',
      );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ATTESTATION_INPUT_INVALID');
    expect(service.createAttestation).not.toHaveBeenCalled();
  });

  it('rejects inherited request properties', () => {
    const body = Object.assign(Object.create({ inherited: 'controlled' }), {
      ...validBody,
    }) as object;
    const fakeRequest = {
      params: { projectId, sourceId },
      query: {},
      body,
      headersDistinct: { 'idempotency-key': [idempotencyKey] },
    } as unknown as Request;

    expect(() => parseAttestationRequest(fakeRequest)).toThrow(
      AttestationInputValidationError,
    );
  });

  it.each(['owner', 'authorized_by_owner'] as const)(
    'creates an attestation for authorizationBasis %s',
    async (authorizationBasis) => {
      const service = createAttestationService();
      const response = await postAttestation(createDependencies(service), {
        key: idempotencyKey,
        body: { ...validBody, authorizationBasis },
      });

      expect(response.status).toBe(201);
      expect(response.headers.location).toBe(
        `${attestationPath()}/${attestationId}`,
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        data: {
          id: attestationId,
          sourceId,
          statementVersion: 'ownership-v1',
          authorizationBasis,
          attestedAt: '2026-07-15T18:00:00.000Z',
        },
      });
      expect(service.createAttestation).toHaveBeenCalledWith({
        workspaceId,
        userId,
        projectId,
        sourceId,
        statementVersion: 'ownership-v1',
        authorizationBasis,
        idempotencyKey,
      });
      for (const internalField of [
        'workspaceId',
        'projectId',
        'userId',
        'createIdempotencyKey',
        'createdAt',
        'statementText',
        'uploadIntent',
      ]) {
        expect(JSON.stringify(response.body)).not.toContain(internalField);
      }
    },
  );

  it('marks an equivalent replay without changing the response identity', async () => {
    const service = createAttestationService({
      createAttestation: vi.fn(async () => ({
        attestation: {
          id: attestationId,
          sourceId,
          statementVersion: 'ownership-v1' as const,
          authorizationBasis: 'owner' as const,
          attestedAt: '2026-07-15T18:00:00.000Z',
        },
        replayed: true,
      })),
    });
    const response = await postAttestation(createDependencies(service), {
      key: idempotencyKey,
      body: validBody,
    });

    expect(response.status).toBe(201);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(response.body.data.id).toBe(attestationId);
  });

  it.each([
    [new AttestationProjectNotFoundError(), 404, 'PROJECT_NOT_FOUND'],
    [new AttestationProjectArchivedError(), 409, 'PROJECT_ARCHIVED'],
    [new AttestationSourceNotFoundError(), 404, 'SOURCE_NOT_FOUND'],
    [
      new SourceNotReadyForAttestationError(),
      409,
      'SOURCE_NOT_READY_FOR_ATTESTATION',
    ],
    [new AttestationIdempotencyConflictError(), 409, 'IDEMPOTENCY_CONFLICT'],
    [new AttestationAlreadyExistsError(), 409, 'ATTESTATION_ALREADY_EXISTS'],
  ])('maps domain errors safely', async (error, status, code) => {
    const service = createAttestationService({
      createAttestation: vi.fn(async () => Promise.reject(error)),
    });
    const response = await postAttestation(createDependencies(service), {
      key: idempotencyKey,
      body: validBody,
    });

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(JSON.stringify(response.body)).not.toContain(projectId);
    expect(JSON.stringify(response.body)).not.toContain(sourceId);
  });
});

describe('OwnershipAttestation domain policy and serialization', () => {
  it.each(['submitted', 'accepted', 'rejected'] as const)(
    'rejects Source state %s',
    (state) => {
      expect(() =>
        assertSourceReadyForAttestation({
          sourceType: 'upload',
          state,
          isActive: false,
          uploadIntent: { completedAt: new Date() },
        }),
      ).toThrow(SourceNotReadyForAttestationError);
    },
  );

  it.each([
    ['missing upload', null],
    ['incomplete upload', { completedAt: null }],
  ])('rejects validating Source with %s', (_label, uploadIntent) => {
    expect(() =>
      assertSourceReadyForAttestation({
        sourceType: 'upload',
        state: 'validating',
        isActive: false,
        uploadIntent,
      }),
    ).toThrow(SourceNotReadyForAttestationError);
  });

  it('accepts only an inactive validating Source with completed upload', () => {
    expect(() =>
      assertSourceReadyForAttestation({
        sourceType: 'upload',
        state: 'validating',
        isActive: false,
        uploadIntent: { completedAt: new Date() },
      }),
    ).not.toThrow();
  });

  it('rejects an active validating Source', () => {
    expect(() =>
      assertSourceReadyForAttestation({
        sourceType: 'upload',
        state: 'validating',
        isActive: true,
        uploadIntent: { completedAt: new Date() },
      }),
    ).toThrow(SourceNotReadyForAttestationError);
  });

  it('keeps the ownership-v1 statement immutable and server-side', () => {
    expect(OWNERSHIP_STATEMENT_VERSION).toBe('ownership-v1');
    expect(OWNERSHIP_STATEMENTS['ownership-v1']).toBe(
      'Confirmo que soy titular de este contenido o que cuento con autorización suficiente del titular para cargarlo y permitir que ClipAI lo procese con el fin de generar transcripciones, análisis y recomendaciones de contenido. Soy responsable de respetar los derechos de terceros.',
    );
    expect(Object.isFrozen(OWNERSHIP_STATEMENTS)).toBe(true);
  });

  it('serializes only the approved public fields', async () => {
    const repository: AttestationRepository = {
      createAttestation: vi.fn(async (input) => ({
        attestation: {
          id: attestationId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          sourceId: input.sourceId,
          userId: input.userId,
          statementVersion: input.statementVersion,
          authorizationBasis: input.authorizationBasis,
          attestedAt: new Date('2026-07-15T18:00:00.000Z'),
          createIdempotencyKey: input.idempotencyKey,
        },
        replayed: false,
      })),
    };
    const result = await new DefaultAttestationService(
      repository,
    ).createAttestation({
      workspaceId,
      projectId,
      sourceId,
      userId,
      statementVersion: 'ownership-v1',
      authorizationBasis: 'owner',
      idempotencyKey,
    });

    expect(result.attestation).toEqual({
      id: attestationId,
      sourceId,
      statementVersion: 'ownership-v1',
      authorizationBasis: 'owner',
      attestedAt: '2026-07-15T18:00:00.000Z',
    });
  });
});
