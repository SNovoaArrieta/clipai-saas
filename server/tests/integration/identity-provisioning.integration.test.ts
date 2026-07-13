import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseClient } from '../../src/database/database-client.js';
import { createPrismaDatabaseClient } from '../../src/database/prisma-database-client.js';
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

describeWithPostgres('PostgreSQL identity provisioning', () => {
  let databaseClient: DatabaseClient;
  let provisioner: PrismaIdentityProvisioner;
  const trackedAuthSubjects = new Set<string>();

  function createTrackedAuthSubject(): string {
    const authSubject = randomUUID();
    trackedAuthSubjects.add(authSubject);
    return authSubject;
  }

  function countTrackedUsers() {
    return databaseClient.prisma.user.count({
      where: { authSubject: { in: [...trackedAuthSubjects] } },
    });
  }

  function countTrackedWorkspaces() {
    return databaseClient.prisma.workspace.count({
      where: {
        owner: { authSubject: { in: [...trackedAuthSubjects] } },
      },
    });
  }

  beforeAll(() => {
    databaseClient = createPrismaDatabaseClient(requireSafeTestDatabaseUrl());
    provisioner = new PrismaIdentityProvisioner(databaseClient.prisma);
  });

  afterEach(async () => {
    const authSubjects = [...trackedAuthSubjects];
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

  it('creates one user and one personal workspace on first provision', async () => {
    const result = await provisioner.provision({
      authSubject: createTrackedAuthSubject(),
    });

    expect(result.user.id).toEqual(expect.any(String));
    expect(result.workspace.id).toEqual(expect.any(String));
    await expect(countTrackedUsers()).resolves.toBe(1);
    await expect(countTrackedWorkspaces()).resolves.toBe(1);
  });

  it('returns the same IDs for the same auth subject', async () => {
    const authSubject = createTrackedAuthSubject();
    const first = await provisioner.provision({ authSubject });
    const second = await provisioner.provision({ authSubject });

    expect(second).toEqual(first);
  });

  it('keeps exactly one user row and one workspace row after repetition', async () => {
    const authSubject = createTrackedAuthSubject();
    await provisioner.provision({ authSubject });
    await provisioner.provision({ authSubject });

    await expect(countTrackedUsers()).resolves.toBe(1);
    await expect(countTrackedWorkspaces()).resolves.toBe(1);
  });

  it('creates a separate user and workspace for a different identity', async () => {
    const first = await provisioner.provision({
      authSubject: createTrackedAuthSubject(),
    });
    const second = await provisioner.provision({
      authSubject: createTrackedAuthSubject(),
    });

    expect(second.user.id).not.toBe(first.user.id);
    expect(second.workspace.id).not.toBe(first.workspace.id);
    await expect(countTrackedUsers()).resolves.toBe(2);
    await expect(countTrackedWorkspaces()).resolves.toBe(2);
  });

  it('updates the stored email for the same internal user', async () => {
    const authSubject = createTrackedAuthSubject();
    const first = await provisioner.provision({
      authSubject,
      email: 'first@example.com',
    });
    const updated = await provisioner.provision({
      authSubject,
      email: 'updated@example.com',
    });

    expect(updated.user.id).toBe(first.user.id);
    expect(updated.user.email).toBe('updated@example.com');
  });

  it('does not erase a stored email when a later identity omits it', async () => {
    const authSubject = createTrackedAuthSubject();
    await provisioner.provision({
      authSubject,
      email: 'stored@example.com',
    });
    const withoutEmail = await provisioner.provision({ authSubject });

    expect(withoutEmail.user.email).toBe('stored@example.com');
  });

  it('does not create duplicates under concurrent requests', async () => {
    const authSubject = createTrackedAuthSubject();
    const results = await Promise.all(
      Array.from({ length: 8 }, async () =>
        provisioner.provision({ authSubject }),
      ),
    );

    expect(new Set(results.map((result) => result.user.id)).size).toBe(1);
    expect(new Set(results.map((result) => result.workspace.id)).size).toBe(1);
    await expect(countTrackedUsers()).resolves.toBe(1);
    await expect(countTrackedWorkspaces()).resolves.toBe(1);
  });

  it('rejects an orphan workspace through the foreign key', async () => {
    const orphanOwnerUserId = randomUUID();

    await expect(
      databaseClient.prisma.workspace.create({
        data: { ownerUserId: orphanOwnerUserId },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      databaseClient.prisma.workspace.count({
        where: { ownerUserId: orphanOwnerUserId },
      }),
    ).resolves.toBe(0);
  });

  it('rejects more than one personal workspace for a user', async () => {
    const result = await provisioner.provision({
      authSubject: createTrackedAuthSubject(),
    });

    await expect(
      databaseClient.prisma.workspace.create({
        data: { ownerUserId: result.user.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(countTrackedWorkspaces()).resolves.toBe(1);
  });
});
