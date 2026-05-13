/**
 * Static check: catalog path removed from server + client; courses routes wired.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const siteRoot = path.join(serverRoot, '..');

function read(relFromServerRoot) {
  return readFileSync(path.join(serverRoot, relFromServerRoot), 'utf8');
}

function readClient(relFromSiteRoot) {
  return readFileSync(path.join(siteRoot, relFromSiteRoot), 'utf8');
}

try {
  const appJs = read('src/app.js');
  if (appJs.includes("/api/v1/catalog") || appJs.includes("'/api/v1/catalog")) {
    throw new Error('[verify-course-api-paths] app.js still mounts /api/v1/catalog');
  }
  if (!appJs.includes("/api/courses")) {
    throw new Error('[verify-course-api-paths] app.js missing /api/courses mount');
  }

  const catalogApi = readClient('client/src/api/catalogApi.js');
  if (catalogApi.includes('/v1/catalog')) {
    throw new Error('[verify-course-api-paths] client catalogApi.js still references /v1/catalog');
  }
  if (!catalogApi.includes('/courses/public')) {
    throw new Error('[verify-course-api-paths] catalogApi missing /courses/public');
  }
  if (!catalogApi.includes('/courses/${encodeURIComponent(String(courseId))}')) {
    throw new Error('[verify-course-api-paths] catalogApi.getCourse must use numeric id path /courses/${id}');
  }
  const coursesRoutes = read('src/routes/courses.routes.js');
  if (!coursesRoutes.includes("router.get('/:id'") && !coursesRoutes.includes('router.get("/:id"')) {
    throw new Error('[verify-course-api-paths] courses.routes must register GET /:id');
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

console.log('verify-course-api-paths: OK');
