/**
 * Static checks: course_batches schema, DTOs, forbidden fields, validation surface.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(fileRel) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-course-batches-shape] missing file: ${fileRel}`);
  return readFileSync(p, 'utf8');
}

function mustContain(fileRel, needles, label) {
  const text = read(fileRel);
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-course-batches-shape] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

function mustNotContainInBlock(block, needles, label) {
  for (const n of needles) {
    if (block.includes(n)) {
      throw new Error(`[verify-course-batches-shape] ${label}: forbidden "${n}" in course_batches block`);
    }
  }
}

function extractCreateTableBlock(sql, tableName) {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\s*\\([\\s\\S]*?\\);`, 'i');
  const match = sql.match(re);
  if (!match) {
    throw new Error(`[verify-course-batches-shape] missing CREATE TABLE ${tableName}`);
  }
  return match[0];
}

function extractTableColumnNames(block) {
  const columns = [];
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('UNIQUE KEY') || trimmed.startsWith('KEY ')) {
      continue;
    }
    const m = trimmed.match(/^([a-z_][a-z0-9_]*)\s+/i);
    if (m && m[1].toLowerCase() !== 'create') columns.push(m[1]);
  }
  return columns;
}

function extractValidatorAllowedFields(validatorSource) {
  const blocks = [...validatorSource.matchAll(/const allowed = \[([\s\S]*?)\];/g)];
  if (blocks.length < 1) {
    throw new Error('[verify-course-batches-shape] could not parse validator allowed fields');
  }
  const fields = new Set();
  for (const block of blocks) {
    for (const m of block[1].matchAll(/'([a-z_]+)'/g)) {
      fields.add(m[1]);
    }
  }
  return [...fields].sort();
}

try {
  const schema = read('src/sql/schema.sql');
  const batchBlock = extractCreateTableBlock(schema, 'course_batches');
  const batchColumns = new Set(extractTableColumnNames(batchBlock));

  mustContain(
    'src/sql/schema.sql',
    [
      'CREATE TABLE IF NOT EXISTS course_batches',
      'idx_course_batches_course',
      'idx_course_batches_status',
      'idx_course_batches_active',
      'idx_course_batches_course_status',
      'fk_course_batches_course',
      'fk_course_batches_created_by',
      'uq_course_batch_course_code',
      'show_publicly',
      'recordings_enabled',
      'sequential_lectures_enabled',
    ],
    'schema: course_batches'
  );

  mustNotContainInBlock(
    batchBlock,
    ['description VARCHAR', 'slug VARCHAR', 'price_amount'],
    'forbidden columns in course_batches block'
  );

  const validatorSource = read('src/validators/courseBatch.schema.js');
  const allowedFields = extractValidatorAllowedFields(validatorSource);
  for (const field of allowedFields) {
    if (!batchColumns.has(field)) {
      throw new Error(
        `[verify-course-batches-shape] validator field "${field}" missing from course_batches schema`
      );
    }
  }

  mustContain(
    'src/dto/courseBatch.dto.js',
    ['toCourseBatchPublicDto', 'seats_remaining', 'batch_selectable', 'computeSeatsRemaining'],
    'dto'
  );
  mustContain(
    'src/validators/courseBatch.schema.js',
    ['.strict()', 'draft', 'start_date', 'COURSE_BATCH_TIMEZONES'],
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
      'show_publicly',
      'insertCourseBatchWithConnection',
    ],
    'service'
  );

  console.log('verify-course-batches-shape: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
