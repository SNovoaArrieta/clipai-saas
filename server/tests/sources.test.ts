import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../src/app.js';
import type { IdentityVerifier } from '../src/identity/identity-verifier.js';
import type { IdentityProvisioner } from '../src/provisioning/identity-provisioner.js';
import { encodeSourceCursor } from '../src/sources/source-cursor.js';
import type {
  SourceRecord,
  SourceRepository,
} from '../src/sources/source-repository.js';
import {
  DefaultSourceService,
  SourceProjectArchivedError,
  SourceProjectNotFoundError,
  SourceQueryError,
  type SourceService,
} from '../src/sources/source-service.js';
import {
  SourceSerializationError,
  type SourceView,
} from '../src/sources/source-serializer.js';

const userId = '0a2ae619-85a6-4571-bccd-3e882cbd2fc8';
const workspaceId = '3ad971a4-79a2-4a3a-9d15-0c9220d31955';
const otherWorkspaceId = '4ad971a4-79a2-4a3a-9d15-0c9220d31956';
const projectId = '9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482';
const otherProjectId = '8dbe3a14-ded1-4f9f-9ca7-e091a7a2f481';
const sourceId = '7f78db17-78ce-49d1-bba7-f02ebbc31d3a';
const authorization = 'Bearer verified-source-token';

function createSourceView(overrides: Partial<SourceView> = {}): SourceView {
  return {
    id: sourceId,
    projectId,
    sourceType: 'upload',
    safeReference: 'Episodio 01.mp4',
    state: 'submitted',
    isActive: false,
    durationMs: null,
    createdAt: '2026-07-15T12:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
    ...overrides,
  };
}

function createDependencies(sourceService?: SourceService): AppDependencies {
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
    ...(sourceService === undefined ? {} : { sourceService }),
  };
}

function createSourceService(
  overrides: Partial<SourceService> = {},
): SourceService {
  return {
    listSources: vi.fn(async (input) => ({
      sources: [],
      limit: input.limit,
      hasMore: false,
    })),
    ...overrides,
  };
}

function getSources(
  dependencies = createDependencies(createSourceService()),
  suffix = '',
) {
  return request(createApp(dependencies))
    .get(`/api/v1/projects/${projectId}/sources${suffix}`)
    .set('Authorization', authorization);
}

describe('workspace-scoped Source listing HTTP contract', () => {
  it('requires authentication', async () => {
    const response = await request(
      createApp(createDependencies(createSourceService())),
    ).get(`/api/v1/projects/${projectId}/sources`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects an invalid projectId without calling the service', async () => {
    const sourceService = createSourceService();
    const response = await request(createApp(createDependencies(sourceService)))
      .get('/api/v1/projects/not-a-uuid/sources')
      .set('Authorization', authorization);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    expect(sourceService.listSources).not.toHaveBeenCalled();
  });

  it.each([
    [new SourceProjectNotFoundError(), 404, 'PROJECT_NOT_FOUND'],
    [new SourceProjectArchivedError(), 409, 'PROJECT_ARCHIVED'],
  ])('maps project visibility safely', async (error, status, code) => {
    const response = await getSources(
      createDependencies(
        createSourceService({
          listSources: vi.fn(async () => Promise.reject(error)),
        }),
      ),
    );

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
  });

  it('returns an empty page with default limit 20', async () => {
    const sourceService = createSourceService();
    const response = await getSources(createDependencies(sourceService));

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      data: [],
      meta: { page: { limit: 20, nextCursor: null, hasMore: false } },
    });
    expect(sourceService.listSources).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      limit: 20,
    });
  });

  it('returns only the approved public fields for one Source', async () => {
    const source = createSourceView({ durationMs: 123_456 });
    const response = await getSources(
      createDependencies(
        createSourceService({
          listSources: vi.fn(async () => ({
            sources: [source],
            limit: 20,
            hasMore: false,
          })),
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([source]);
    expect(Object.keys(response.body.data[0])).toEqual([
      'id',
      'projectId',
      'sourceType',
      'safeReference',
      'state',
      'isActive',
      'durationMs',
      'createdAt',
      'updatedAt',
    ]);
    expect(JSON.stringify(response.body)).not.toContain(workspaceId);
  });

  it('preserves multiple Sources in service order', async () => {
    const sources = [
      createSourceView(),
      createSourceView({ id: '6f78db17-78ce-49d1-bba7-f02ebbc31d39' }),
    ];
    const response = await getSources(
      createDependencies(
        createSourceService({
          listSources: vi.fn(async () => ({
            sources,
            limit: 20,
            hasMore: false,
          })),
        }),
      ),
    );

    expect(response.body.data).toEqual(sources);
  });

  it.each(['1', '100'])('accepts boundary limit %s', async (limit) => {
    const sourceService = createSourceService();
    const response = await getSources(
      createDependencies(sourceService),
      `?limit=${limit}`,
    );

    expect(response.status).toBe(200);
    expect(sourceService.listSources).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      limit: Number(limit),
    });
  });

  it.each(['0', '-1', '101', '1.5', 'value', ''])(
    'rejects invalid limit %s before calling the service',
    async (limit) => {
      const sourceService = createSourceService();
      const response = await getSources(
        createDependencies(sourceService),
        `?limit=${limit}`,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('SOURCE_QUERY_INVALID');
      expect(sourceService.listSources).not.toHaveBeenCalled();
    },
  );

  it.each(['?limit=1&limit=2', '?cursor=first&cursor=second'])(
    'rejects repeated pagination parameters in %s',
    async (query) => {
      const sourceService = createSourceService();
      const response = await getSources(
        createDependencies(sourceService),
        query,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('SOURCE_QUERY_INVALID');
      expect(sourceService.listSources).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed and checksum-altered cursors before service access', async () => {
    const sourceService = createSourceService();
    const valid = encodeSourceCursor({
      workspaceId,
      projectId,
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
      id: sourceId,
    });
    const altered = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;

    for (const cursor of ['malformed', altered]) {
      const response = await getSources(
        createDependencies(sourceService),
        `?cursor=${cursor}`,
      );
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('SOURCE_QUERY_INVALID');
    }
    expect(sourceService.listSources).not.toHaveBeenCalled();
  });

  it('passes a valid decoded cursor and reports the next cursor', async () => {
    const cursor = encodeSourceCursor({
      workspaceId,
      projectId,
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
      id: sourceId,
    });
    const sourceService = createSourceService({
      listSources: vi.fn(async (input) => ({
        sources: [createSourceView()],
        limit: input.limit,
        hasMore: true,
        nextCursor: 'next-opaque-cursor',
      })),
    });
    const response = await getSources(
      createDependencies(sourceService),
      `?limit=1&cursor=${cursor}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.meta.page).toEqual({
      limit: 1,
      nextCursor: 'next-opaque-cursor',
      hasMore: true,
    });
    expect(sourceService.listSources).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      limit: 1,
      cursor: {
        workspaceId,
        projectId,
        createdAt: new Date('2026-07-15T12:00:00.000Z'),
        id: sourceId,
      },
    });
  });

  it.each(['workspaceId', 'userId', 'projectId'])(
    'rejects the unapproved query field %s',
    async (field) => {
      const response = await getSources(undefined, `?${field}=controlled`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('SOURCE_QUERY_INVALID');
    },
  );
});

function createRecord(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: sourceId,
    projectId,
    sourceType: 'upload',
    safeReference: 'Episodio 01.mp4',
    state: 'submitted',
    isActive: false,
    durationMs: null,
    createdAt: new Date('2026-07-15T12:00:00.000Z'),
    updatedAt: new Date('2026-07-15T12:00:00.000Z'),
    ...overrides,
  };
}

function createRepository(
  records: readonly SourceRecord[] = [],
): SourceRepository {
  return {
    getProjectVisibility: vi.fn(async () => 'available' as const),
    listSourceRecords: vi.fn(async () => records),
  };
}

describe('Source listing use case', () => {
  it.each(['missing', 'archived'] as const)(
    'does not query Sources when Project visibility is %s',
    async (visibility) => {
      const repository = createRepository();
      repository.getProjectVisibility = vi.fn(async () => visibility);
      const service = new DefaultSourceService(repository);

      await expect(
        service.listSources({ workspaceId, projectId, limit: 20 }),
      ).rejects.toBeInstanceOf(
        visibility === 'missing'
          ? SourceProjectNotFoundError
          : SourceProjectArchivedError,
      );
      expect(repository.listSourceRecords).not.toHaveBeenCalled();
    },
  );

  it.each([
    { workspaceId: otherWorkspaceId, projectId },
    { workspaceId, projectId: otherProjectId },
  ])(
    'rejects a cursor outside its bound scope before repository queries',
    async (scope) => {
      const repository = createRepository();
      const service = new DefaultSourceService(repository);

      await expect(
        service.listSources({
          workspaceId,
          projectId,
          limit: 20,
          cursor: {
            ...scope,
            createdAt: new Date('2026-07-15T12:00:00.000Z'),
            id: sourceId,
          },
        }),
      ).rejects.toBeInstanceOf(SourceQueryError);
      expect(repository.getProjectVisibility).not.toHaveBeenCalled();
      expect(repository.listSourceRecords).not.toHaveBeenCalled();
    },
  );

  it('serializes BigInt duration safely and generates a cursor from the last visible row', async () => {
    const repository = createRepository([
      createRecord({ durationMs: 90_000n }),
      createRecord({ id: '6f78db17-78ce-49d1-bba7-f02ebbc31d39' }),
    ]);
    const result = await new DefaultSourceService(repository).listSources({
      workspaceId,
      projectId,
      limit: 1,
    });

    expect(result.sources[0]?.durationMs).toBe(90_000);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
    expect(repository.listSourceRecords).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      limit: 2,
    });
  });

  it('refuses a BigInt duration that JSON cannot represent safely', async () => {
    const repository = createRepository([
      createRecord({ durationMs: BigInt(Number.MAX_SAFE_INTEGER) + 1n }),
    ]);

    await expect(
      new DefaultSourceService(repository).listSources({
        workspaceId,
        projectId,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(SourceSerializationError);
  });
});
