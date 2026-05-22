/**
 * Static checks: subject foundation files and admin routes (no live MySQL).
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function mustContain(fileRel, needles, label) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-subjects-foundation] missing file: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-subjects-foundation] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

try {
  mustContain(
    'src/sql/schema.sql',
    ['CREATE TABLE IF NOT EXISTS subjects', 'course_id', 'fk_subjects_course', 'order_index'],
    'schema: subjects'
  );
  mustContain(
    'src/routes/admin.routes.js',
    ["/courses/:courseId/subjects", 'getSubjects', 'postSubject', 'deleteSubject'],
    'admin routes'
  );
  mustContain('src/controllers/subjects.controller.js', ['sendSuccess', 'admin.subject.create', 'admin.subject.deactivate'], 'controller');
  mustContain('src/services/subject.service.js', ['listSubjectsForCourse', 'INSERT INTO subjects'], 'service');
  const clientApi = path.join(root, '..', 'client', 'src', 'api', 'adminApi.js');
  if (!existsSync(clientApi)) {
    throw new Error('[verify-subjects-foundation] missing client adminApi.js');
  }
  const apiText = readFileSync(clientApi, 'utf8');
  if (!apiText.includes('/admin/courses/${courseId}/subjects')) {
    throw new Error('[verify-subjects-foundation] adminApi subjects paths');
  }
  console.log('verify-subjects-foundation: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
