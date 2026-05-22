import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-only: `/api` must hit the same port the Express server uses (`PORT` in `../server/.env`, default 4000).
 * A mismatch returns 500 from the Vite proxy with no logs on the API — easy to confuse with a backend bug.
 */
function resolveApiDevProxyTarget() {
  const fromShell = String(process.env.VITE_API_PROXY_TARGET || '').trim();
  if (fromShell) return fromShell.replace(/\/$/, '');
  const fallbackPort = 4000;
  const envPath = path.resolve(process.cwd(), '../server/.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/^\s*PORT\s*=\s*(\S+)/m);
    if (match) {
      const n = Number(match[1].trim().replace(/^["']|["']$/g, ''));
      if (Number.isFinite(n) && n > 0 && n <= 65535) {
        return `http://127.0.0.1:${n}`;
      }
    }
  } catch {
    // Missing or unreadable server/.env — use default API port.
  }
  return `http://127.0.0.1:${fallbackPort}`;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@course-wizard-schema': path.resolve(process.cwd(), '../server/src/validators/courseWizard.schema.js'),
      '@': path.resolve(process.cwd(), './src'),
      '@components': path.resolve(process.cwd(), './src/components'),
      '@pages': path.resolve(process.cwd(), './src/pages'),
      '@styles': path.resolve(process.cwd(), './src/styles'),
      '@data': path.resolve(process.cwd(), './src/data'),
      '@assets': path.resolve(process.cwd(), './src/assets'),
    },
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      allow: [path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '../server')],
    },
    proxy: {
      '/api': {
        target: resolveApiDevProxyTarget(),
        changeOrigin: true,
      },
    },
  },
});
