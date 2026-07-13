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
    expect(loadEnv({})).toEqual({ nodeEnv: 'development', port: 3000 });
  });

  it('rejects invalid values clearly', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow('Invalid NODE_ENV');
    expect(() => loadEnv({ PORT: '70000' })).toThrow('Invalid PORT');
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow('Missing PORT');
  });
});
