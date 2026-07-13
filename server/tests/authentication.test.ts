import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import type { AuthenticatedIdentity } from '../src/identity/authenticated-identity.js';
import { MAX_BEARER_TOKEN_LENGTH } from '../src/identity/bearer-token.js';
import {
  IdentityVerificationError,
  type IdentityVerifier,
} from '../src/identity/identity-verifier.js';
import {
  IdentityProvisioningError,
  type IdentityProvisioner,
  type ProvisionedIdentity,
} from '../src/provisioning/identity-provisioner.js';

function createVerifier(
  verify: (token: string) => Promise<AuthenticatedIdentity>,
): IdentityVerifier {
  return { verifyAccessToken: verify };
}

function createProvisioner(
  provision: (identity: AuthenticatedIdentity) => Promise<ProvisionedIdentity>,
): IdentityProvisioner {
  return { provision };
}

describe('authentication boundary', () => {
  it('keeps /health public when authentication is not configured', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'server' });
  });

  it('returns 503 when authentication is not configured', async () => {
    const response = await request(createApp()).get('/api/v1/me');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Authentication is not available.',
      },
    });
  });

  it('rejects a missing Authorization header', async () => {
    const identityVerifier = createVerifier(async () => ({
      authSubject: 'unused',
    }));
    const response = await request(createApp({ identityVerifier })).get(
      '/api/v1/me',
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it.each([
    ['a different scheme', 'Basic credentials'],
    ['an empty Bearer value', 'Bearer'],
    ['ambiguous credentials', 'Bearer first, Bearer second'],
    ['invalid spacing', 'Bearer  token'],
  ])('rejects %s', async (_case, authorization) => {
    const identityVerifier = createVerifier(async () => ({
      authSubject: 'unused',
    }));
    const response = await request(createApp({ identityVerifier }))
      .get('/api/v1/me')
      .set('Authorization', authorization);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID');
  });

  it('rejects an excessively long token', async () => {
    const identityVerifier = createVerifier(async () => ({
      authSubject: 'unused',
    }));
    const response = await request(createApp({ identityVerifier }))
      .get('/api/v1/me')
      .set(
        'Authorization',
        `Bearer ${'a'.repeat(MAX_BEARER_TOKEN_LENGTH + 1)}`,
      );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID');
  });

  it('returns only the provisioned internal identity projection', async () => {
    const identityVerifier = createVerifier(async (token) => {
      expect(token).toBe('verified-token');
      return {
        authSubject: 'verified-subject',
        email: 'user@example.com',
        providerMetadata: { role: 'should-not-leak' },
      } as AuthenticatedIdentity;
    });
    const identityProvisioner = createProvisioner(async (identity) => {
      expect(identity.authSubject).toBe('verified-subject');
      expect(identity.email).toBe('user@example.com');
      return {
        user: { id: 'internal-user-id', email: 'user@example.com' },
        workspace: { id: 'internal-workspace-id' },
      };
    });
    const response = await request(
      createApp({ identityVerifier, identityProvisioner }),
    )
      .get('/api/v1/me')
      .set('Authorization', 'Bearer verified-token');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      data: {
        user: {
          id: 'internal-user-id',
          email: 'user@example.com',
        },
        workspace: { id: 'internal-workspace-id' },
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('verified-token');
    expect(JSON.stringify(response.body)).not.toContain('verified-subject');
    expect(JSON.stringify(response.body)).not.toContain('authSubject');
  });

  it('omits email when the provisioned identity does not contain it', async () => {
    const identityVerifier = createVerifier(async () => ({
      authSubject: 'verified-subject',
    }));
    const identityProvisioner = createProvisioner(async () => ({
      user: { id: 'internal-user-id' },
      workspace: { id: 'internal-workspace-id' },
    }));
    const response = await request(
      createApp({ identityVerifier, identityProvisioner }),
    )
      .get('/api/v1/me')
      .set('Authorization', 'Bearer verified-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        user: { id: 'internal-user-id' },
        workspace: { id: 'internal-workspace-id' },
      },
    });
  });

  it('returns 503 after valid authentication when persistence is not configured', async () => {
    const identityVerifier = createVerifier(async () => ({
      authSubject: 'verified-subject',
    }));
    const response = await request(createApp({ identityVerifier }))
      .get('/api/v1/me')
      .set('Authorization', 'Bearer verified-token');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PERSISTENCE_NOT_CONFIGURED');
  });

  it('returns 503 when persistence is temporarily unavailable', async () => {
    const identityVerifier = createVerifier(async () => ({
      authSubject: 'verified-subject',
    }));
    const identityProvisioner = createProvisioner(async () => {
      throw new IdentityProvisioningError('unavailable');
    });
    const response = await request(
      createApp({ identityVerifier, identityProvisioner }),
    )
      .get('/api/v1/me')
      .set('Authorization', 'Bearer verified-token');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'PERSISTENCE_UNAVAILABLE',
        message: 'Persistence is temporarily unavailable.',
      },
    });
  });

  it('does not expose persistence internals on unexpected failures', async () => {
    const identityVerifier = createVerifier(async () => ({
      authSubject: 'verified-subject',
    }));
    const identityProvisioner = createProvisioner(async () => {
      throw new Error(
        'Prisma P2002 SELECT * FROM User postgresql://secret@db.internal',
      );
    });
    const response = await request(
      createApp({ identityVerifier, identityProvisioner }),
    )
      .get('/api/v1/me')
      .set('Authorization', 'Bearer verified-token');
    const serializedBody = JSON.stringify(response.body);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(serializedBody).not.toContain('Prisma');
    expect(serializedBody).not.toContain('P2002');
    expect(serializedBody).not.toContain('SELECT');
    expect(serializedBody).not.toContain('postgresql');
    expect(serializedBody).not.toContain('db.internal');
  });

  it('normalizes invalid tokens without exposing verifier details', async () => {
    const identityVerifier = createVerifier(async () => {
      throw new Error('jose internal signature and key details');
    });
    const response = await request(createApp({ identityVerifier }))
      .get('/api/v1/me')
      .set('Authorization', 'Bearer invalid-token');
    const serializedBody = JSON.stringify(response.body);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID');
    expect(serializedBody).not.toContain('jose');
    expect(serializedBody).not.toContain('signature');
    expect(serializedBody).not.toContain('stack');
    expect(serializedBody).not.toContain('invalid-token');
  });

  it('returns 503 when identity verification is temporarily unavailable', async () => {
    const identityVerifier = createVerifier(async () => {
      throw new IdentityVerificationError('unavailable');
    });
    const response = await request(createApp({ identityVerifier }))
      .get('/api/v1/me')
      .set('Authorization', 'Bearer unavailable-token');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'AUTH_VERIFICATION_UNAVAILABLE',
        message: 'Authentication verification is temporarily unavailable.',
      },
    });
  });

  it('keeps unknown routes controlled', async () => {
    const response = await request(createApp()).get('/api/v1/missing');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
