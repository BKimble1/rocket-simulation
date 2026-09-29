import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: '/home/user/rocket-simulation',
  cacheDir: '/tmp/claude-0/-home-user/27a32fdd-e1b7-5170-a6d8-816a0def8caa/scratchpad/engine/vite-cache',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
});
