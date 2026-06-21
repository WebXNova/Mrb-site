/**
 * Passing marks migration — regression tests (logic only, no DB).
 *
 * Run: npm run test:passing-marks-migration
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

console.log('passing marks migration — regression tests\n');

const schemaSql = readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8');
ok('schema has passing_marks DECIMAL', schemaSql.includes('passing_marks DECIMAL(8,2)'));
ok('schema removed passing_percentage', !schemaSql.includes('passing_percentage'));

const passStatusJs = readFileSync(path.join(__dirname, '../result/passStatus.js'), 'utf8');
ok('passStatus SQL uses score >= passing_marks', passStatusJs.includes('r.score >= COALESCE(t.passing_marks'));
ok('passStatus JS uses score param', passStatusJs.includes('passingMarks'));

const gradingCalc = readFileSync(path.join(__dirname, '../grading/gradingCalculation.js'), 'utf8');
ok('grading uses passingMarks config', gradingCalc.includes('passingMarks'));
ok('grading compares score not percentage for pass', gradingCalc.includes('roundedScore >= passingMarks'));

const gradingRepo = readFileSync(path.join(__dirname, '../grading/grading.repository.js'), 'utf8');
ok('grading repo loads passing_marks', gradingRepo.includes('t.passing_marks'));

const testRulesSchema = readFileSync(path.join(__dirname, '../validators/testRules.schema.js'), 'utf8');
ok('rules schema rejects passing_percentage key in forbidden list', testRulesSchema.includes("'passing_percentage'"));
ok('rules schema requires passing_marks in allowed keys', testRulesSchema.includes("'passing_marks'"));

const totalMarksService = readFileSync(path.join(__dirname, '../services/testTotalMarks.service.js'), 'utf8');
ok('total marks uses SUM aggregation', totalMarksService.includes('SUM(COALESCE'));
ok('total marks cache exists', totalMarksService.includes('totalMarksCache'));

const migrationJs = readFileSync(path.join(__dirname, '../db/ensurePassingMarksMigration.js'), 'utf8');
ok('migration backfills from percentage', migrationJs.includes('passing_percentage / 100'));
ok('migration drops passing_percentage', migrationJs.includes('DROP COLUMN passing_percentage'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
