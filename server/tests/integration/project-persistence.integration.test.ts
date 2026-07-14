import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseClient } from '../../src/database/database-client.js';
import { createPrismaDatabaseClient } from '../../src/database/prisma-database-client.js';
import { decodeProjectCursor } from '../../src/projects/project-cursor.js';
import { PrismaProjectService } from '../../src/projects/prisma-project-service.js';
import {
  ProjectIdempotencyConflictError,
  ProjectQueryError,
  type ProjectView,
} from '../../src/projects/project-service.js';
import { PrismaIdentityProvisioner } from '../../src/provisioning/prisma-identity-provisioner.js';

const configuredTestDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase =
  configuredTestDatabaseUrl !== undefined && configuredTestDatabaseUrl !== '';

function requireSafeTestDatabaseUrl(): string {
  if (!hasTestDatabase || configuredTestDatabaseUrl === undefined) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
  }

  if (process.env.NODE_ENV !== 'test') {
    throw new Error('PostgreSQL tests require NODE_ENV=test.');
  }

  let url: URL;

  try {
    url = new URL(configuredTestDatabaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !databaseName.toLowerCase().includes('test')
  ) {
    throw new Error(
      'PostgreSQL tests require a database name containing "test".',
    );
  }

  return configuredTestDatabaseUrl;
}

const describeWithPostgres = hasTestDatabase ? describe : describe.skip;

describeWithPostgres('PostgreSQL workspace-scoped projects', () => {
  let databaseClient: DatabaseClient;
  let identityProvisioner: PrismaIdentityProvisioner;
  let projectService: PrismaProjectService;
  const trackedAuthSubjects = new Set<string>();

  function createTrackedAuthSubject(): string {
    const authSubject = randomUUID();
    trackedAuthSubjects.add(authSubject);
    return authSubject;
  }

  async function createWorkspace() {
    return identityProvisioner.provision({
      authSubject: createTrackedAuthSubject(),
    });
  }

  function createProject(workspaceId: string, title = 'Project title') {
    return projectService.createProject({
      workspaceId,
      title,
      idempotencyKey: `project:${randomUUID()}`,
    });
  }

  beforeAll(() => {
    databaseClient = createPrismaDatabaseClient(requireSafeTestDatabaseUrl());
    identityProvisioner = new PrismaIdentityProvisioner(databaseClient.prisma);
    projectService = new PrismaProjectService(databaseClient.prisma);
  });

  afterEach(async () => {
    const authSubjects = [...trackedAuthSubjects];
    await databaseClient.prisma.project.deleteMany({
      where: { workspace: { owner: { authSubject: { in: authSubjects } } } },
    });
    await databaseClient.prisma.workspace.deleteMany({
      where: { owner: { authSubject: { in: authSubjects } } },
    });
    await databaseClient.prisma.user.deleteMany({
      where: { authSubject: { in: authSubjects } },
    });
    trackedAuthSubjects.clear();
  });

  afterAll(async () => {
    if (databaseClient === undefined) {
      return;
    }

    await databaseClient.close();
  });

  it('persists one project row', async () => {
    const principal = await createWorkspace();
    const result = await createProject(principal.workspace.id);

    await expect(
      databaseClient.prisma.project.count({
        where: { id: result.project.id },
      }),
    ).resolves.toBe(1);
  });

  it('assigns the project to the resolved workspace', async () => {
    const principal = await createWorkspace();
    const result = await createProject(principal.workspace.id);
    const stored = await databaseClient.prisma.project.findUniqueOrThrow({
      where: { id: result.project.id },
      select: { workspaceId: true },
    });

    expect(stored.workspaceId).toBe(principal.workspace.id);
  });

  it('allows duplicate titles with different idempotency keys', async () => {
    const principal = await createWorkspace();
    const first = await createProject(principal.workspace.id, 'Repeated title');
    const second = await createProject(
      principal.workspace.id,
      'Repeated title',
    );

    expect(second.project.id).not.toBe(first.project.id);
    await expect(
      databaseClient.prisma.project.count({
        where: { workspaceId: principal.workspace.id, title: 'Repeated title' },
      }),
    ).resolves.toBe(2);
  });

  it('replays the same idempotent Project creation without duplication', async () => {
    const principal = await createWorkspace();
    const idempotencyKey = `project:${randomUUID()}`;
    const input = {
      workspaceId: principal.workspace.id,
      title: 'Idempotent title',
      idempotencyKey,
    };
    const first = await projectService.createProject(input);
    const replay = await projectService.createProject(input);

    expect(replay.project.id).toBe(first.project.id);
    expect(replay.replayed).toBe(true);
    await expect(
      databaseClient.prisma.project.count({
        where: {
          workspaceId: principal.workspace.id,
          createIdempotencyKey: idempotencyKey,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rejects reuse of an idempotency key with another title', async () => {
    const principal = await createWorkspace();
    const idempotencyKey = `project:${randomUUID()}`;
    await projectService.createProject({
      workspaceId: principal.workspace.id,
      title: 'First intention',
      idempotencyKey,
    });

    await expect(
      projectService.createProject({
        workspaceId: principal.workspace.id,
        title: 'Different intention',
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(ProjectIdempotencyConflictError);
  });

  it('serializes concurrent creation with the same idempotency key', async () => {
    const principal = await createWorkspace();
    const idempotencyKey = `project:${randomUUID()}`;
    const input = {
      workspaceId: principal.workspace.id,
      title: 'Concurrent intention',
      idempotencyKey,
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => projectService.createProject(input)),
    );

    expect(new Set(results.map(({ project }) => project.id)).size).toBe(1);
    await expect(
      databaseClient.prisma.project.count({
        where: {
          workspaceId: principal.workspace.id,
          createIdempotencyKey: idempotencyKey,
        },
      }),
    ).resolves.toBe(1);
  });

  it('lists only projects from the requested workspace', async () => {
    const firstPrincipal = await createWorkspace();
    const secondPrincipal = await createWorkspace();
    const firstProject = await createProject(
      firstPrincipal.workspace.id,
      'First workspace',
    );
    await createProject(secondPrincipal.workspace.id, 'Second workspace');

    const result = await projectService.listProjects({
      workspaceId: firstPrincipal.workspace.id,
      limit: 20,
    });

    expect(result.projects.map(({ id }) => id)).toEqual([
      firstProject.project.id,
    ]);
  });

  it('does not expose first-workspace projects to a second workspace', async () => {
    const firstPrincipal = await createWorkspace();
    const secondPrincipal = await createWorkspace();
    const hidden = await createProject(firstPrincipal.workspace.id, 'Hidden');
    const visible = await createProject(
      secondPrincipal.workspace.id,
      'Visible',
    );

    const result = await projectService.listProjects({
      workspaceId: secondPrincipal.workspace.id,
      limit: 20,
    });

    expect(result.projects.map(({ id }) => id)).toEqual([visible.project.id]);
    expect(result.projects.map(({ id }) => id)).not.toContain(
      hidden.project.id,
    );
  });

  it('uses a stable updatedAt and id descending order', async () => {
    const principal = await createWorkspace();
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createProject(principal.workspace.id, `Ordered ${index}`),
      ),
    );

    const result = await projectService.listProjects({
      workspaceId: principal.workspace.id,
      limit: 20,
    });
    const expected = [...result.projects].sort(compareProjectsDescending);

    expect(result.projects).toEqual(expected);
  });

  it('paginates without repeating or omitting projects', async () => {
    const principal = await createWorkspace();
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createProject(principal.workspace.id, `Page ${index}`),
      ),
    );
    const seen: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await projectService.listProjects({
        workspaceId: principal.workspace.id,
        limit: 2,
        ...(cursor === undefined
          ? {}
          : {
              cursor: decodeProjectCursor(cursor),
            }),
      });
      seen.push(...page.projects.map(({ id }) => id));
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    expect(new Set(seen).size).toBe(5);
    expect(seen).toHaveLength(5);
    expect(seen.sort()).toEqual(
      created.map(({ project }) => project.id).sort(),
    );
  });

  it('keeps a cursor from one workspace scoped to another workspace', async () => {
    const secondPrincipal = await createWorkspace();
    const visible = await createProject(
      secondPrincipal.workspace.id,
      'Visible',
    );
    await databaseClient.prisma.project.update({
      where: { id: visible.project.id },
      data: { updatedAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    const firstPrincipal = await createWorkspace();
    await createProject(firstPrincipal.workspace.id, 'First A');
    await createProject(firstPrincipal.workspace.id, 'First B');
    const firstPage = await projectService.listProjects({
      workspaceId: firstPrincipal.workspace.id,
      limit: 1,
    });

    expect(firstPage.nextCursor).toBeDefined();
    await expect(
      projectService.listProjects({
        workspaceId: secondPrincipal.workspace.id,
        limit: 20,
        cursor: decodeProjectCursor(firstPage.nextCursor as string),
      }),
    ).rejects.toBeInstanceOf(ProjectQueryError);
    await expect(
      databaseClient.prisma.project.count({
        where: { id: visible.project.id },
      }),
    ).resolves.toBe(1);
  });

  it('rejects a project with a nonexistent workspace through the foreign key', async () => {
    const workspaceId = randomUUID();

    await expectForeignKeyViolation(
      databaseClient.prisma.project.create({
        data: {
          workspaceId,
          title: 'Orphan',
          createIdempotencyKey: `project:${randomUUID()}`,
        },
      }),
    );
  });

  it('restricts deleting a workspace that still owns a project', async () => {
    const principal = await createWorkspace();
    await createProject(principal.workspace.id);

    await expectForeignKeyViolation(
      databaseClient.prisma.workspace.delete({
        where: { id: principal.workspace.id },
      }),
    );
  });

  it('deletes only synthetic projects selected by workspace', async () => {
    const firstPrincipal = await createWorkspace();
    const secondPrincipal = await createWorkspace();
    const first = await createProject(firstPrincipal.workspace.id);
    const second = await createProject(secondPrincipal.workspace.id);

    await databaseClient.prisma.project.deleteMany({
      where: {
        workspaceId: firstPrincipal.workspace.id,
        id: first.project.id,
      },
    });

    await expect(
      databaseClient.prisma.project.count({
        where: { id: first.project.id },
      }),
    ).resolves.toBe(0);
    await expect(
      databaseClient.prisma.project.count({
        where: { id: second.project.id },
      }),
    ).resolves.toBe(1);
  });

  it('deletes projects before their synthetic workspace and user', async () => {
    const principal = await createWorkspace();
    const project = await createProject(principal.workspace.id);

    await databaseClient.prisma.project.delete({
      where: { id: project.project.id },
    });
    await databaseClient.prisma.workspace.delete({
      where: { id: principal.workspace.id },
    });
    await databaseClient.prisma.user.delete({
      where: { id: principal.user.id },
    });

    await expect(
      databaseClient.prisma.user.count({ where: { id: principal.user.id } }),
    ).resolves.toBe(0);
  });
});

function compareProjectsDescending(first: ProjectView, second: ProjectView) {
  const updatedAtDifference =
    new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();

  return updatedAtDifference === 0
    ? second.id.localeCompare(first.id)
    : updatedAtDifference;
}

async function expectForeignKeyViolation(operation: Promise<unknown>) {
  let rejection: unknown;

  try {
    await operation;
  } catch (error: unknown) {
    rejection = error;
  }

  if (typeof rejection !== 'object' || rejection === null) {
    expect.fail('Expected a PostgreSQL foreign key violation.');
  }

  const error = rejection as {
    readonly code?: unknown;
    readonly cause?: { readonly code?: unknown };
  };
  expect(
    error.code === 'P2003' ||
      error.cause?.code === '23503' ||
      error.cause?.code === '23001',
  ).toBe(true);
}
