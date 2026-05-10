/**
 * Entry used by npm run dev: free PORT then load API (runs startServer via side effects).
 */
import { createRequire } from 'node:module';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const killPort = require('kill-port');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

if (String(process.env.SKIP_KILL_DEV_PORT || '').toLowerCase() !== 'true') {
  const port = Number(process.env.PORT || 4000);
  if (Number.isFinite(port) && port > 0 && port <= 65535) {
    try {
      await killPort(port);
      console.info(`[dev] Port ${port} is free`);
    } catch {
      // Unused — OK
    }
  }
}

await import('../src/server.js');
