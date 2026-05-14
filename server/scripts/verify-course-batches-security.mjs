/**
 * Static security checks: CSRF on writes, rate limiter, no SELECT *, no Bearer-only patterns in batch module.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  const p = path.join(root, rel);
  if (!existsSync(p)) throw new Error(`[verify-course-batches-security] missing ${rel}`);
  return readFileSync(p, 'utf8');
}

try {
  const routes = read('src/routes/courseBatch.routes.js');
  if (!routes.includes('requireCsrf')) {
    throw new Error('batch admin writes must use requireCsrf');
  }
  if (!routes.includes('courseBatchWriteRateLimit')) {
    throw new Error('batch admin writes must use courseBatchWriteRateLimit');
  }
  if (!routes.includes('rejectAuthHeaderInProduction')) {
    throw new Error('batch routes must reject Authorization header in production');
  }

  const svc = read('src/services/courseBatch.service.js');
  if (/\bSELECT\s+\*/i.test(svc)) {
    throw new Error('courseBatch.service must not use SELECT *');
  }

  const ctrl = read('src/controllers/courseBatch.controller.js');
  if (/Bearer\s/i.test(ctrl)) {
    throw new Error('courseBatch.controller must not reference Bearer tokens');
  }

  console.log('verify-course-batches-security: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
