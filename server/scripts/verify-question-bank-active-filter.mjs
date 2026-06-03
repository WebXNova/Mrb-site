/**
 * Audit: every question_bank read in application code must enforce deleted_at IS NULL.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcRoot = path.join(root, 'src');

/** Paths allowed to query question_bank without active filter (mutations / migrations). */
const ALLOWLIST_FILE_SUFFIXES = [
  path.join('sql', 'migrations'),
  path.join('sql', 'schema.sql'),
  path.join('db', 'ensureQuestionBankSoftDeleteSchema.js'),
  path.join('services', 'questions.service.js'), // lockActiveQuestionRow, fetchSoftDeletedQuestionRow, UPDATE
];

/** Read helpers that centralize the active predicate. */
const CENTRALIZED_READ_MODULES = [
  path.join('services', 'questionBankQueries.service.js'),
  path.join('services', 'questionBankRead.service.js'),
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, files);
    } else if (/\.(js|mjs|sql)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function isAllowlisted(fileRel) {
  return ALLOWLIST_FILE_SUFFIXES.some((suffix) => fileRel.includes(suffix.replace(/\\/g, '/')));
}

function isCentralizedReadModule(fileRel) {
  return CENTRALIZED_READ_MODULES.some((suffix) => fileRel.endsWith(suffix.replace(/\\/g, '/')));
}

function auditQuestionBankQueries() {
  const violations = [];
  const files = walk(srcRoot);

  for (const file of files) {
    const fileRel = rel(file);
    const text = readFileSync(file, 'utf8');
    if (!text.includes('question_bank')) continue;

    const isMutationAllowlisted = isAllowlisted(fileRel);
    const isReadModule = isCentralizedReadModule(fileRel);

    if (isReadModule) {
      const usesCentralQueries =
        text.includes('questionBankQueries.service.js') || text.includes('deleted_at IS NULL');
      if (!usesCentralQueries) {
        violations.push(`${fileRel}: read module must use questionBankQueries or deleted_at IS NULL`);
      }
      continue;
    }

    if (isMutationAllowlisted) continue;

    // Any other file referencing question_bank must not SELECT without going through helpers.
    if (/FROM\s+question_bank|JOIN\s+question_bank/i.test(text) && !text.includes('deleted_at IS NULL')) {
      violations.push(`${fileRel}: question_bank query without deleted_at IS NULL guard`);
    }
  }

  return violations;
}

try {
  const violations = auditQuestionBankQueries();
  if (violations.length) {
    console.error('[verify-question-bank-active-filter] FAIL');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log('verify-question-bank-active-filter: OK');
  console.log('');
  console.log('Centralized modules:');
  console.log('  - src/services/questionBankQueries.service.js  (SQL fragments + filters)');
  console.log('  - src/services/questionBankRead.service.js     (shared read helpers)');
  console.log('');
  console.log('Regression checklist:');
  console.log('  [ ] GET /api/questions — deleted rows absent from list');
  console.log('  [ ] GET /api/questions?search= — search excludes deleted');
  console.log('  [ ] GET /api/questions?course_id= — filter excludes deleted');
  console.log('  [ ] GET /api/questions/:id — deleted returns QUESTION_NOT_FOUND');
  console.log('  [ ] PUT /api/questions/:id — deleted returns QUESTION_NOT_FOUND');
  console.log('  [ ] DELETE /api/questions/:id — idempotent 404 on second delete');
  console.log('  [ ] Test builder selector — uses listActiveQuestionsForSelector only');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
