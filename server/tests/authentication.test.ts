import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import type { AuthenticatedIdentity } from '../src/identity/authenticated-identity.js';
import { MAX_BEARER_TOKEN_LENGTH } from '../src/identity/bearer-token.js';
import {
  IdentityVerificationError,
  type IdentityVerifier,
} from '../src/identity/identity-verifier.js';

function createVerifier(
  verify: (token: string) => Promise<AuthenticatedIdentity>,
): IdentityVerifier {
  return { verifyAccessToken: verify };
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

  it('returns only the verified identity projection', async () => {
    const identityVerifier = createVerifier(async (token) => {
      expect(token).toBe('verified-token');
      return {
        authSubject: 'verified-subject',
        email: 'user@example.com',
        providerMetadata: { role: 'should-not-leak' },
      } as AuthenticatedIdentity;
    });
    const response = await request(createApp({ identityVerifier }))
      .get('/api/v1/me')
      .set('Authorization', 'Bearer verified-token');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      data: {
        authSubject: 'verified-subject',
        email: 'user@example.com',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('verified-token');
    expect(Object.keys(response.body.data)).toEqual(['authSubject', 'email']);
  });

  it('omits email when the verified identity does not contain it', async () => {
    const identityVerifier = createVerifier(async () => ({
      authSubject: 'verified-subject',
    }));
    const response = await request(createApp({ identityVerifier }))
      .get('/api/v1/me')
      .set('Authorization', 'Bearer verified-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { authSubject: 'verified-subject' },
    });
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
