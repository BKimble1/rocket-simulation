import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build (vite preview). Chromium with SwiftShader:
 * this environment has no GPU, so these tests check behaviour and continuity, not frame rate.
 * BASE selects the base path under test (/ or /rocket/).
 */
const BASE = process.env.BASE ?? '/';
const PORT = BASE === '/' ? 4173 : 4174;
const gpuArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}${BASE}`,
    launchOptions: { args: gpuArgs },
    trace: 'off',
  },
  webServer: {
    command: BASE === '/' ? `npx vite preview --port ${PORT} --strictPort` : `npx vite preview --base=${BASE} --outDir dist-rocket --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}${BASE}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone-portrait', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }, grep: /@phone/ },
    { name: 'phone-landscape', use: { ...devices['Pixel 7 landscape'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }, grep: /@phone/ },
  ],
});
