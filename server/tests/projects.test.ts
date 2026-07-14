import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { IdentityVerifier } from '../src/identity/identity-verifier.js';
import {
  ProjectIdempotencyConflictError,
  ProjectPersistenceError,
  type ProjectService,
  type ProjectView,
} from '../src/projects/project-service.js';
import type { IdentityProvisioner } from '../src/provisioning/identity-provisioner.js';

const userId = '0a2ae619-85a6-4571-bccd-3e882cbd2fc8';
const workspaceId = '3ad971a4-79a2-4a3a-9d15-0c9220d31955';
const projectId = '9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482';
const authorization = 'Bearer verified-project-token';
const idempotencyKey = 'project-create-key-0001';

function createProjectView(overrides: Partial<ProjectView> = {}): ProjectView {
  return {
    id: projectId,
    title: 'Podcast episodio 01',
    state: 'draft',
    createdAt: '2026-07-13T18:00:00.000Z',
    updatedAt: '2026-07-13T18:00:00.000Z',
    archivedAt: null,
    ...overrides,
  };
}

function createDependencies(projectService?: ProjectService) {
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
    ...(projectService === undefined ? {} : { projectService }),
  };
}

function createProjectService(
  overrides: Partial<ProjectService> = {},
): ProjectService {
  return {
    createProject: vi.fn(async (input) => ({
      project: createProjectView({ title: input.title }),
      replayed: false,
    })),
    listProjects: vi.fn(async (input) => ({
      projects: [],
      limit: input.limit,
      hasMore: false,
    })),
    ...overrides,
  };
}

describe('workspace-scoped projects', () => {
  it('creates a normalized project for the server-resolved workspace', async () => {
    const projectService = createProjectService();
    const dependencies = createDependencies(projectService);
    const response = await request(createApp(dependencies))
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: '  Podcast episodio 01  ' });

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/api/v1/projects/${projectId}`);
    expect(response.body.data.title).toBe('Podcast episodio 01');
    expect(response.body.data).not.toHaveProperty('workspaceId');
    expect(response.body.data).not.toHaveProperty('authSubject');
    expect(projectService.createProject).toHaveBeenCalledWith({
      workspaceId,
      title: 'Podcast episodio 01',
      idempotencyKey,
    });
    expect(dependencies.identityProvisioner.provision).toHaveBeenCalledTimes(1);
  });

  it.each([
    'id',
    'workspaceId',
    'ownerUserId',
    'createdByUserId',
    'createdAt',
    'updatedAt',
    'archivedAt',
    'authSubject',
  ])('rejects the server-controlled field %s', async (field) => {
    const response = await request(
      createApp(createDependencies(createProjectService())),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Valid title', [field]: 'controlled-value' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PROJECT_INPUT_INVALID');
  });

  it.each(['', '   '])('rejects an empty title %#', async (title) => {
    const response = await request(
      createApp(createDependencies(createProjectService())),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PROJECT_INPUT_INVALID');
  });

  it('rejects a title longer than 160 characters', async () => {
    const response = await request(
      createApp(createDependencies(createProjectService())),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'á'.repeat(161) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PROJECT_INPUT_INVALID');
  });

  it('accepts valid Spanish and Unicode characters', async () => {
    const projectService = createProjectService();
    const response = await request(
      createApp(createDependencies(projectService)),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Episodio: creación, IA y café ☕' });

    expect(response.status).toBe(201);
    expect(projectService.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Episodio: creación, IA y café ☕' }),
    );
  });

  it('rejects control characters in a title', async () => {
    const response = await request(
      createApp(createDependencies(createProjectService())),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'First\nSecond' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PROJECT_INPUT_INVALID');
  });

  it('requires Idempotency-Key for project creation', async () => {
    const response = await request(
      createApp(createDependencies(createProjectService())),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .send({ title: 'Valid title' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects an invalid Idempotency-Key', async () => {
    const response = await request(
      createApp(createDependencies(createProjectService())),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'short')
      .send({ title: 'Valid title' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PROJECT_INPUT_INVALID');
  });

  it('marks an idempotent replay without exposing internal scope', async () => {
    const projectService = createProjectService({
      createProject: vi.fn(async () => ({
        project: createProjectView(),
        replayed: true,
      })),
    });
    const response = await request(
      createApp(createDependencies(projectService)),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Podcast episodio 01' });

    expect(response.status).toBe(201);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(JSON.stringify(response.body)).not.toContain(workspaceId);
  });

  it('returns a safe conflict for a reused key with another title', async () => {
    const projectService = createProjectService({
      createProject: vi.fn(async () => {
        throw new ProjectIdempotencyConflictError();
      }),
    });
    const response = await request(
      createApp(createDependencies(projectService)),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Different intention' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('returns 503 when persistence is not configured', async () => {
    const identityVerifier: IdentityVerifier = {
      verifyAccessToken: vi.fn(async () => ({ authSubject: 'subject' })),
    };
    const response = await request(createApp({ identityVerifier }))
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Valid title' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PERSISTENCE_NOT_CONFIGURED');
  });

  it('returns 503 when project persistence is unavailable', async () => {
    const projectService = createProjectService({
      createProject: vi.fn(async () => {
        throw new ProjectPersistenceError('unavailable');
      }),
    });
    const response = await request(
      createApp(createDependencies(projectService)),
    )
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Valid title' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PERSISTENCE_UNAVAILABLE');
  });

  it('returns an empty list using the approved page envelope', async () => {
    const response = await request(
      createApp(createDependencies(createProjectService())),
    )
      .get('/api/v1/projects')
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      meta: { page: { limit: 20, nextCursor: null, hasMore: false } },
    });
  });

  it('returns only the scoped service result in its stable order', async () => {
    const projects = [
      createProjectView({ id: 'c663a6c0-3b5a-41fa-9b4c-1092b31aa739' }),
      createProjectView({ id: '89785a7d-5579-42ff-8a9a-a83a0cf7ae82' }),
    ];
    const projectService = createProjectService({
      listProjects: vi.fn(async (input) => ({
        projects,
        limit: input.limit,
        hasMore: false,
      })),
    });
    const response = await request(
      createApp(createDependencies(projectService)),
    )
      .get('/api/v1/projects')
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(projects);
    expect(projectService.listProjects).toHaveBeenCalledWith({
      workspaceId,
      limit: 20,
    });
    expect(JSON.stringify(response.body)).not.toContain(workspaceId);
  });

  it('accepts a valid limit', async () => {
    const projectService = createProjectService();
    const response = await request(
      createApp(createDependencies(projectService)),
    )
      .get('/api/v1/projects?limit=50')
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(projectService.listProjects).toHaveBeenCalledWith({
      workspaceId,
      limit: 50,
    });
  });

  it.each(['0', '-1', '101', '1.5', 'value'])(
    'rejects the invalid limit %s',
    async (limit) => {
      const response = await request(
        createApp(createDependencies(createProjectService())),
      )
        .get(`/api/v1/projects?limit=${limit}`)
        .set('Authorization', authorization);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PROJECT_QUERY_INVALID');
    },
  );

  it('rejects an invalid cursor before querying persistence', async () => {
    const projectService = createProjectService();
    const response = await request(
      createApp(createDependencies(projectService)),
    )
      .get('/api/v1/projects?cursor=not-a-valid-cursor')
      .set('Authorization', authorization);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PROJECT_QUERY_INVALID');
    expect(projectService.listProjects).not.toHaveBeenCalled();
  });

  it.each(['workspaceId', 'userId'])(
    'rejects the query field %s',
    async (field) => {
      const response = await request(
        createApp(createDependencies(createProjectService())),
      )
        .get(`/api/v1/projects?${field}=controlled`)
        .set('Authorization', authorization);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PROJECT_QUERY_INVALID');
    },
  );

  it('returns an opaque next cursor when another page exists', async () => {
    const projectService = createProjectService({
      listProjects: vi.fn(async () => ({
        projects: [createProjectView()],
        limit: 1,
        hasMore: true,
        nextCursor: 'opaque-next-cursor',
      })),
    });
    const response = await request(
      createApp(createDependencies(projectService)),
    )
      .get('/api/v1/projects?limit=1')
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body.meta.page).toEqual({
      limit: 1,
      nextCursor: 'opaque-next-cursor',
      hasMore: true,
    });
  });

  it('keeps project routes authenticated', async () => {
    const response = await request(
      createApp(createDependencies(createProjectService())),
    ).get('/api/v1/projects');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('keeps /health public and /api/v1/me on the shared principal contract', async () => {
    const dependencies = createDependencies(createProjectService());
    const app = createApp(dependencies);
    const health = await request(app).get('/health');
    const me = await request(app)
      .get('/api/v1/me')
      .set('Authorization', authorization);

    expect(health.status).toBe(200);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      data: {
        user: { id: userId, email: 'private@example.com' },
        workspace: { id: workspaceId },
      },
    });
  });
});
