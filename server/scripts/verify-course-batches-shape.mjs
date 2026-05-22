/**
 * Static checks: course_batches schema, DTOs, forbidden fields, validation surface.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function mustContain(fileRel, needles, label) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-course-batches-shape] missing file: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-course-batches-shape] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

function mustNotContain(fileRel, needles, label) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-course-batches-shape] missing file: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (text.includes(n)) {
      throw new Error(`[verify-course-batches-shape] ${label}: forbidden "${n}" in ${fileRel}`);
    }
  }
}

try {
  mustContain(
    'src/sql/schema.sql',
    [
      'CREATE TABLE IF NOT EXISTS course_batches',
      'idx_course_batches_course',
      'idx_course_batches_status',
      'idx_course_batches_active',
      'idx_course_batches_enrollment_window',
      'idx_course_batches_course_status',
      'fk_course_batches_course',
      'fk_course_batches_created_by',
      'uq_course_batch_course_code',
      'allow_enrollment',
    ],
    'schema: course_batches'
  );
  mustNotContain(
    'src/sql/schema.sql',
    ['description VARCHAR', 'slug VARCHAR', 'price_amount'],
    'forbidden columns in course_batches block'
  );
  mustContain('src/sql/schema.sql', ['CREATE TABLE IF NOT EXISTS course_batches'], 'reference schema');
  mustContain(
    'src/dto/courseBatch.dto.js',
    ['toCourseBatchPublicDto', 'seats_remaining', 'enrollment_open', 'computeSeatsRemaining'],
    'dto'
  );
  mustContain(
    'src/validators/courseBatch.schema.js',
    ['.strict()', 'draft', 'enrollment_close_at', 'COURSE_BATCH_TIMEZONES'],
    'validators'
  );
  mustContain(
    'src/services/courseBatch.service.js',
    [
      'validateBatchStateTransition',
      'validateEnrollmentWindow',
      'validateSeatRules',
      'COURSE_BATCH_ROW_SELECT',
      'listPublicCourseBatches',
      'allow_enrollment',
      'insertCourseBatchWithConnection',
    ],
    'service'
  );
  mustContain('src/sql/schema.sql', ['allow_enrollment', 'show_publicly'], 'schema: batch wizard flags');
  console.log('verify-course-batches-shape: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
