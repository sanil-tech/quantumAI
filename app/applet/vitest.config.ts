import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@iati/core-types': path.resolve(__dirname, 'packages/core-types/src/index.ts'),
      '@iati/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@iati/event-bus': path.resolve(__dirname, 'packages/event-bus/src/index.ts'),
      '@iati/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@iati/cache': path.resolve(__dirname, 'packages/cache/src/index.ts'),
      '@iati/security': path.resolve(__dirname, 'packages/security/src/index.ts'),
    },
  },
});
