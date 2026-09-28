import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any static host path.
  base: './',
  server: { host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
