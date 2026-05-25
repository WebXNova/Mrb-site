/**
 * Static security checks: parent admin stack for CSRF + bearer, batch write rate limits,
 * no SELECT *, no Bearer-only patterns in batch module.
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
  const adminRoutes = read('src/routes/admin.routes.js');
  const batch = read('src/routes/courseBatch.routes.js');

  if (!adminRoutes.includes('adminSecurityStack')) {
    throw new Error('admin.routes must mount adminSecurityStack (CSRF + bearer) before batch routes');
  }
  if (!adminRoutes.includes('courseBatchAdminRoutes')) {
    throw new Error('admin.routes must mount courseBatchAdminRoutes');
  }
  if (batch.includes('requireCsrf') || batch.includes('rejectAuthHeaderInProduction')) {
    throw new Error('courseBatch.routes duplicates parent admin stack; remove per-route CSRF/bearer here');
  }

  if (!batch.includes('courseBatchWriteRateLimit')) {
    throw new Error('batch admin writes must use courseBatchWriteRateLimit');
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
