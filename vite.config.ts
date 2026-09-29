/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Static build. The base path is configurable so the same source serves at `/` (standalone)
 * and under `/rocket/` (the future Idlery hub): `vite build --base=/rocket/` or ROCKET_BASE.
 * Every runtime URL (textures, narration, deep links) is resolved from import.meta.env.BASE_URL.
 */
export default defineConfig({
  base: process.env.ROCKET_BASE ?? '/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1800,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
  },
});
