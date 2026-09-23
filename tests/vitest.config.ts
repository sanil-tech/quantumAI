import { defineConfig } from 'vitest/config';
import 'dotenv/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['dotenv/config'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
