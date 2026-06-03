/**
 * Audit raw mysqlPool.query usage against CEE protected instructional tables.
 *
 * Usage:
 *   node scripts/audit-scoped-query-migration.mjs
 *   node scripts/audit-scoped-query-migration.mjs --strict   # exit 1 on any student-path hit
 *   node scripts/audit-scoped-query-migration.mjs --json
 *
 * Student-path files are high priority for scopedQuery migration.
 * Admin files are reported as informational (often need audited bypass).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.resolve(__dirname, '../src');

const PROTECTED_TABLES = [
  'lectures',
  'tests',
  'test_questions',
  'test_attempts',
  'test_results',
  'test_attempt_answers',
  'chapters',
  'subjects',
  'courses',
];

const STUDENT_PRIORITY_GLOBS = [
  'services/studentPortal.service.js',
  'services/testAttempt.service.js',
  'services/studentAuth.service.js',
  'services/studentQuestions.service.js',
  'security/cee/testEntitlement.service.js',
  'controllers/publicTests.controller.js',
];

const ADMIN_INFO_GLOBS = [
  'services/lecture.service.js',
  'services/chapter.service.js',
  'services/subject.service.js',
  'services/test.service.js',
];

const SCOPE_HINT_PATTERN =
  /course_id\s*=\s*\?|course_id\s*=\s*['"]?\d|tests\.course_id|lectures\.course_id|subjects\.course_id|s\.course_id\s*=\s*\?/i;

const POOL_QUERY_PATTERN = /mysqlPool\.query|\.query\s*\(/;

const FROM_TABLE_PATTERN = new RegExp(
  `\\bfrom\\s+\`?(${PROTECTED_TABLES.join('|')})\`?|\\bjoin\\s+\`?(${PROTECTED_TABLES.join('|')})\`?`,
  'gi'
);

const args = new Set(process.argv.slice(2));
const jsonOut = args.has('--json');
const strict = args.has('--strict');

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walkJsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'sql') continue;
      files.push(...(await walkJsFiles(full)));
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * @param {string} rel
 */
function classifyFile(rel) {
  const normalized = rel.replace(/\\/g, '/');
  if (STUDENT_PRIORITY_GLOBS.some((g) => normalized.endsWith(g))) return 'student';
  if (ADMIN_INFO_GLOBS.some((g) => normalized.endsWith(g))) return 'admin';
  if (normalized.includes('/security/cee/')) return 'cee';
  if (normalized.includes('/services/')) return 'service';
  return 'other';
}

/**
 * @param {string} content
 * @param {number} lineIndex
 */
function extractSqlWindow(content, lineIndex) {
  const lines = content.split('\n');
  const start = Math.max(0, lineIndex - 2);
  const end = Math.min(lines.length, lineIndex + 8);
  return lines.slice(start, end).join('\n');
}

/**
 * @param {string} rel
 * @param {string} content
 */
function analyzeFile(rel, content) {
  const tier = classifyFile(rel);
  const lines = content.split('\n');
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isQueryCall = POOL_QUERY_PATTERN.test(line);
    if (!isQueryCall) continue;

    const window = extractSqlWindow(content, i);
    if (!FROM_TABLE_PATTERN.test(window)) continue;

    FROM_TABLE_PATTERN.lastIndex = 0;
    const tables = new Set();
    let m;
    while ((m = FROM_TABLE_PATTERN.exec(window)) !== null) {
      tables.add((m[1] || m[2]).toLowerCase());
    }

    const hasScopeHint = SCOPE_HINT_PATTERN.test(window);
    const usesScopedQuery =
      /scopedQuery\s*\(|scopedQueryFromRequest|scopedQueryOnce|validateScopedQuery|queryScoped/.test(window);

    let severity = 'info';
    if (tier === 'student' && !usesScopedQuery) {
      severity = hasScopeHint ? 'warn' : 'error';
    } else if (tier === 'admin' && !hasScopeHint && !usesScopedQuery) {
      severity = 'warn';
    }

    findings.push({
      file: rel,
      line: i + 1,
      tier,
      severity,
      tables: [...tables],
      hasScopeHint,
      usesScopedQuery,
      snippet: line.trim().slice(0, 120),
    });
  }

  return findings;
}

async function main() {
  const files = await walkJsFiles(srcRoot);
  const allFindings = [];

  for (const abs of files) {
    const rel = path.relative(srcRoot, abs).replace(/\\/g, '/');
    if (rel.includes('ScopedQueryRunner') || rel.includes('scopedQueryGuard')) continue;
    const content = await fs.readFile(abs, 'utf8');
    allFindings.push(...analyzeFile(rel, content));
  }

  const errors = allFindings.filter((f) => f.severity === 'error');
  const warns = allFindings.filter((f) => f.severity === 'warn');

  if (jsonOut) {
    console.log(JSON.stringify({ errors, warns, info: allFindings.filter((f) => f.severity === 'info') }, null, 2));
  } else {
    console.log('CEE Scoped Query Migration Audit\n');
    if (errors.length) {
      console.log(`STUDENT PATH — must migrate (${errors.length}):`);
      for (const f of errors) {
        console.log(`  [error] ${f.file}:${f.line} tables=[${f.tables.join(',')}] scopeHint=${f.hasScopeHint}`);
        console.log(`          ${f.snippet}`);
      }
      console.log('');
    }
    if (warns.length) {
      console.log(`WARN — review scope or add scopedQuery (${warns.length}):`);
      for (const f of warns.slice(0, 40)) {
        console.log(`  [warn] ${f.file}:${f.line} tier=${f.tier} tables=[${f.tables.join(',')}]`);
      }
      if (warns.length > 40) console.log(`  ... and ${warns.length - 40} more`);
      console.log('');
    }
    const scoped = allFindings.filter((f) => f.usesScopedQuery).length;
    console.log(`Total pool+protected hits: ${allFindings.length} (scopedQuery nearby: ${scoped})`);
    console.log('\nSee src/security/cee/SCOPED_QUERY_MIGRATION.md for conversion patterns.');
  }

  const fail = strict ? errors.length + warns.length > 0 : errors.length > 0;
  if (fail) {
    process.exitCode = 1;
    if (!jsonOut) {
      console.error(strict ? '\nAudit FAILED (--strict).' : '\nAudit FAILED (student errors).');
    }
  } else if (!jsonOut) {
    console.log('Audit passed (no student-path unscoped errors).');
  }
}

main().catch((err) => {
  console.error('Audit crashed:', err);
  process.exitCode = 1;
});
