/**
 * PM2 instance role + student-facing infra wiring tests.
 * Run: npm run test:pm2-instance-role
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isPm2BackgroundLeader,
  shouldStartBackgroundJobs,
  shouldStartEmailQueueWorker,
} from './pm2InstanceRole.js';
import {
  MAX_RASTER_IMAGE_PIXELS,
  SHARP_MAX_IN_FLIGHT,
  SHARP_LIB_CONCURRENCY,
} from './rasterImageReencode.js';
import { MAX_SYNC_XLSX_EXPORT_ATTEMPTS } from '../controllers/testResultExport.controller.js';
import { COURSE_NOTES_UPLOAD_MAX_BYTES } from '../services/courseNoteUpload.service.js';
import { HTTP_REQUEST_TIMEOUT_MS } from '../config/reliabilityTimeouts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');
const serverRoot = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function mustContain(absPath, needle, label) {
  ok(`exists: ${label}`, existsSync(absPath));
  const text = readFileSync(absPath, 'utf8');
  ok(`${label}: "${needle}"`, text.includes(needle));
}

console.log('pm2InstanceRole + student infra guards\n');

console.log('[cluster role]');
ok('unset NODE_APP_INSTANCE is leader', isPm2BackgroundLeader({}));
ok('instance 0 is leader', isPm2BackgroundLeader({ NODE_APP_INSTANCE: '0' }));
ok('instance 1 is not leader', !isPm2BackgroundLeader({ NODE_APP_INSTANCE: '1' }));
ok('background jobs follow leader', shouldStartBackgroundJobs({ NODE_APP_INSTANCE: '0' }));
ok('background jobs skip follower', !shouldStartBackgroundJobs({ NODE_APP_INSTANCE: '1' }));
ok('EMAIL_WORKER_ENABLED=false wins', !shouldStartEmailQueueWorker({ EMAIL_WORKER_ENABLED: 'false' }));
ok('BACKGROUND_JOBS_ENABLED=true on follower', shouldStartBackgroundJobs({ NODE_APP_INSTANCE: '1', BACKGROUND_JOBS_ENABLED: 'true' }));

console.log('\n[memory / sharp / export]');
ok('Sharp in-flight capped at 2', SHARP_MAX_IN_FLIGHT === 2);
ok('Sharp lib concurrency is 1', SHARP_LIB_CONCURRENCY === 1);
ok('pixel bomb guard present', MAX_RASTER_IMAGE_PIXELS === 4096 * 4096);
ok('sync XLSX export capped', MAX_SYNC_XLSX_EXPORT_ATTEMPTS === 1500);
ok('course notes max ≤ nginx 12m', COURSE_NOTES_UPLOAD_MAX_BYTES === 12 * 1024 * 1024);

console.log('\n[timeouts]');
ok('Node requestTimeout slightly above Nginx 95s', HTTP_REQUEST_TIMEOUT_MS === 100_000);

console.log('\n[wiring]');
mustContain(path.join(repoRoot, 'ecosystem.config.js'), "exec_mode: 'cluster'", 'ecosystem cluster mode');
mustContain(path.join(repoRoot, 'ecosystem.config.js'), 'instances: 2', 'ecosystem two instances');
mustContain(path.join(repoRoot, 'ecosystem.config.js'), "MYSQL_POOL_CONNECTION_LIMIT: '15'", 'halved pool per worker');
mustContain(path.join(serverRoot, 'src/server.js'), 'shouldStartEmailQueueWorker', 'email worker gated');
mustContain(path.join(serverRoot, 'src/server.js'), 'shouldStartBackgroundJobs', 'cleanup gated');
mustContain(path.join(serverRoot, 'src/utils/rasterImageReencode.js'), 'limitInputPixels', 'sharp pixel limit');
mustContain(
  path.join(repoRoot, 'deployment/nginx/proxy-api.conf'),
  'proxy_read_timeout 95s',
  'nginx CF-aligned read timeout'
);
mustContain(path.join(serverRoot, 'src/app.js'), 'alive: true', 'health liveness flag');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
