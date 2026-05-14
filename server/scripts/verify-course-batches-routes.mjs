/**
 * Route wiring checks for course_batches admin + public paths.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  const p = path.join(root, rel);
  if (!existsSync(p)) throw new Error(`[verify-course-batches-routes] missing ${rel}`);
  return readFileSync(p, 'utf8');
}

try {
  const adminRoutes = read('src/routes/admin.routes.js');
  if (!adminRoutes.includes('courseBatchAdminRoutes')) {
    throw new Error('admin.routes must mount courseBatchAdminRoutes');
  }

  const batchRoutes = read('src/routes/courseBatch.routes.js');
  for (const needle of [
    "router.get('/courses/:courseId/batches'",
    "router.post('/courses/:courseId/batches'",
    "router.put('/batches/:batchId'",
    "router.post('/batches/:batchId/archive'",
    "router.post('/batches/:batchId/reactivate'",
  ]) {
    if (!batchRoutes.includes(needle)) {
      throw new Error(`courseBatch.routes.js missing ${needle}`);
    }
  }

  const coursesRoutes = read('src/routes/courses.routes.js');
  if (!coursesRoutes.includes("/:courseId/batches") || !coursesRoutes.includes('getPublicCourseBatches')) {
    throw new Error('courses.routes must expose GET /:courseId/batches before /:id');
  }
  const idxBatches = coursesRoutes.indexOf("router.get('/:courseId/batches'");
  const idxId = coursesRoutes.indexOf("router.get('/:id'");
  if (idxBatches === -1 || idxId === -1 || idxBatches > idxId) {
    throw new Error('public batches route must be registered before /:id');
  }

  const clientApi = path.join(root, '..', 'client', 'src', 'api', 'adminApi.js');
  if (!existsSync(clientApi)) throw new Error('missing client adminApi.js');
  const apiText = readFileSync(clientApi, 'utf8');
  if (!apiText.includes('/admin/batches/')) {
    throw new Error('adminApi must include /admin/batches/ paths');
  }
  const cat = path.join(root, '..', 'client', 'src', 'api', 'catalogApi.js');
  if (!existsSync(cat)) throw new Error('missing catalogApi.js');
  const catText = readFileSync(cat, 'utf8');
  if (!catText.includes('/batches')) {
    throw new Error('catalogApi must list course batches');
  }

  console.log('verify-course-batches-routes: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
