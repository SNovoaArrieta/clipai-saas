import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

describe('GET /health', () => {
  it('returns the exact public health contract', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'server',
    });
    expect(Object.keys(response.body)).toEqual(['status', 'service']);

    const serializedBody = JSON.stringify(response.body).toLowerCase();
    for (const sensitiveField of [
      'secret',
      'token',
      'password',
      'stack',
      'version',
      'environment',
    ]) {
      expect(serializedBody).not.toContain(sensitiveField);
    }
  });
});

describe('unknown routes', () => {
  it('returns a controlled not-found response', async () => {
    const response = await request(createApp()).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });
});

describe('environment configuration', () => {
  it('uses safe development defaults', () => {
    expect(loadEnv({})).toEqual({
      nodeEnv: 'development',
      port: 3000,
      authMode: 'disabled',
      supabaseJwtAudience: 'authenticated',
    });
  });

  it('rejects invalid values clearly', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow('Invalid NODE_ENV');
    expect(() => loadEnv({ PORT: '70000' })).toThrow('Invalid PORT');
    expect(() => loadEnv({ AUTH_MODE: 'fake' })).toThrow('Invalid AUTH_MODE');
    expect(() => loadEnv({ AUTH_MODE: 'supabase' })).toThrow(
      'Missing SUPABASE_URL',
    );
    expect(() =>
      loadEnv({ SUPABASE_JWT_AUDIENCE: 'invalid audience' }),
    ).toThrow('Invalid SUPABASE_JWT_AUDIENCE');
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'supabase',
        SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toThrow('Missing PORT');
  });

  it('rejects disabled authentication in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        AUTH_MODE: 'disabled',
      }),
    ).toThrow('authentication cannot be disabled in production');
  });

  it('requires PostgreSQL persistence in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        AUTH_MODE: 'supabase',
        SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toThrow('Missing DATABASE_URL');
  });

  it('accepts only PostgreSQL database URLs', () => {
    expect(
      loadEnv({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/clipai_test',
      }),
    ).toMatchObject({
      databaseUrl: 'postgresql://user:password@localhost:5432/clipai_test',
    });

    for (const invalidUrl of [
      'not-a-url',
      'https://localhost/database',
      'postgresql:///database',
      'postgresql://localhost',
      'postgresql://localhost/database#fragment',
    ]) {
      expect(() => loadEnv({ DATABASE_URL: invalidUrl })).toThrow(
        'Invalid DATABASE_URL',
      );
    }
  });

  it('validates and normalizes Supabase authentication configuration', () => {
    expect(
      loadEnv({
        AUTH_MODE: 'supabase',
        SUPABASE_URL: 'https://project.supabase.co/',
      }),
    ).toEqual({
      nodeEnv: 'development',
      port: 3000,
      authMode: 'supabase',
      supabaseUrl: 'https://project.supabase.co',
      supabaseJwtAudience: 'authenticated',
    });

    for (const invalidUrl of [
      'http://project.supabase.co',
      'https://user:password@project.supabase.co',
      'https://project.supabase.co/path',
      'https://project.supabase.co?query=value',
      'https://project.supabase.co#fragment',
    ]) {
      expect(() =>
        loadEnv({ AUTH_MODE: 'supabase', SUPABASE_URL: invalidUrl }),
      ).toThrow('Invalid SUPABASE_URL');
    }
  });
});
