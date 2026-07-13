import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    sequence: {
      concurrent: false,
    },
  },
});
