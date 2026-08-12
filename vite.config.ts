import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@iati/core-types': path.resolve(__dirname, 'packages/core-types/src/index.ts'),
        '@iati/core/marketDataValidator': path.resolve(__dirname, 'packages/core/src/marketDataValidator.ts'),
        '@iati/core/smc': path.resolve(__dirname, 'packages/core/src/smc.ts'),
        '@iati/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
        '@iati/event-bus': path.resolve(__dirname, 'packages/event-bus/src/index.ts'),
        '@iati/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
        '@iati/cache': path.resolve(__dirname, 'packages/cache/src/index.ts'),
        '@iati/security': path.resolve(__dirname, 'packages/security/src/index.ts'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
