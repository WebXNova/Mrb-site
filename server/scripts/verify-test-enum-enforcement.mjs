/**
 * P2 PATCH-7 — strict enum enforcement verification.
 * Run: node scripts/verify-test-enum-enforcement.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool } from '../src/config/mysql.js';
import { AppError } from '../src/errors/base/AppError.js';
import {
  parseStrictTestCategory,
  parseStrictTestType,
  parseStrictTestDbStatus,
} from '../src/validators/testEnumGuards.js';
import { testBasicInfoBodySchema } from '../src/validators/testBasicInfo.schema.js';
import { constraintExists } from '../src/db/ensureTestEnumConstraints.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) throw new Error(`${label}: missing ${pattern}`);
  console.log(`PASS ${label}`);
}

// --- Application layer ---
assertMatch('schema — z.enum test_type', read('src/validators/testBasicInfo.schema.js'), /test_type:\s*z\.enum\(TEST_TYPE_VALUES/);
assertMatch('schema — z.enum category', read('src/validators/testBasicInfo.schema.js'), /category:[\s\S]*z\.enum\(TEST_CATEGORY_VALUES/);
assertMatch('guards module', read('src/validators/testEnumGuards.js'), /parseStrictTestType/);
assertMatch('constants — TEST_DB_STATUS_VALUES', read('src/constants/testMetadata.constants.js'), /TEST_DB_STATUS_VALUES/);

let rejected = false;
try {
  parseStrictTestType('invalid_test_type');
} catch (e) {
  rejected = e instanceof AppError && e.errorCode === 'INVALID_TEST_TYPE';
}
if (!rejected) throw new Error('parseStrictTestType should reject invalid_test_type');
console.log('PASS App — invalid_test_type rejected');

rejected = false;
try {
  parseStrictTestCategory('ECAT');
} catch (e) {
  rejected = e instanceof AppError && e.errorCode === 'INVALID_CATEGORY';
}
if (!rejected) throw new Error('parseStrictTestCategory should reject ECAT');
console.log('PASS App — invalid_category rejected');

rejected = false;
try {
  parseStrictTestDbStatus('ARCHIVED');
} catch (e) {
  rejected = e instanceof AppError && e.errorCode === 'VALIDATION_ERROR';
}
if (!rejected) throw new Error('parseStrictTestDbStatus should reject ARCHIVED');
console.log('PASS App — invalid_status rejected');

const zod = testBasicInfoBodySchema.safeParse({
  course_id: 1,
  title: 'Valid Test Title',
  test_type: 'invalid_test_type',
  subject_id: 1,
});
if (zod.success) throw new Error('Zod should reject invalid test_type');
console.log('PASS Zod — invalid test_type rejected');

const zodCat = testBasicInfoBodySchema.safeParse({
  course_id: 1,
  title: 'Valid Test Title',
  test_type: 'subject_wise',
  category: 'ECAT',
  subject_id: 1,
});
if (zodCat.success) throw new Error('Zod should reject invalid category');
console.log('PASS Zod — invalid category rejected');

// --- Database layer ---
const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
const db = dbRows[0]?.db;
if (!db) {
  console.log('SKIP DB — no database selected');
} else {
  const hasType = await constraintExists(mysqlPool, db, 'tests', 'chk_tests_test_type');
  const hasCategory = await constraintExists(mysqlPool, db, 'tests', 'chk_tests_category');
  const hasStatus = await constraintExists(mysqlPool, db, 'tests', 'chk_tests_status');

  console.log(`DB CHECK chk_tests_test_type: ${hasType ? 'present' : 'missing'}`);
  console.log(`DB CHECK chk_tests_category: ${hasCategory ? 'present' : 'missing'}`);
  console.log(`DB CHECK chk_tests_status: ${hasStatus ? 'present' : 'missing'}`);

  if (hasType && hasCategory && hasStatus) {
    const [courses] = await mysqlPool.query(`SELECT id FROM courses ORDER BY id ASC LIMIT 1`);
    const [users] = await mysqlPool.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
    if (courses[0] && users[0]) {
      const connection = await mysqlPool.getConnection();
      try {
        await connection.beginTransaction();
        let dbRejected = false;
        try {
          await connection.query(
            `INSERT INTO tests
               (course_id, title, category, test_type, duration_minutes, max_attempts, status, created_by)
             VALUES (?, 'Enum Test', 'ECAT', 'subject_wise', 30, 1, 'INCOMPLETE', ?)`,
            [Number(courses[0].id), Number(users[0].id)]
          );
        } catch (e) {
          dbRejected = e.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || e.errno === 3819;
        }
        if (!dbRejected) throw new Error('DB should reject invalid category ECAT');
        console.log('PASS DB — invalid_category rejected');

        dbRejected = false;
        try {
          await connection.query(
            `INSERT INTO tests
               (course_id, title, category, test_type, duration_minutes, max_attempts, status, created_by)
             VALUES (?, 'Enum Test', 'MDCAT', 'invalid_test_type', 30, 1, 'INCOMPLETE', ?)`,
            [Number(courses[0].id), Number(users[0].id)]
          );
        } catch (e) {
          dbRejected = e.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || e.errno === 3819;
        }
        if (!dbRejected) throw new Error('DB should reject invalid_test_type');
        console.log('PASS DB — invalid_test_type rejected');

        dbRejected = false;
        try {
          await connection.query(
            `INSERT INTO tests
               (course_id, title, category, test_type, duration_minutes, max_attempts, status, created_by)
             VALUES (?, 'Enum Test', 'MDCAT', 'subject_wise', 30, 1, 'ARCHIVED', ?)`,
            [Number(courses[0].id), Number(users[0].id)]
          );
        } catch (e) {
          dbRejected = e.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || e.errno === 3819;
        }
        if (!dbRejected) throw new Error('DB should reject invalid_status');
        console.log('PASS DB — invalid_status rejected');

        await connection.rollback();
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    } else {
      console.log('SKIP DB insert cases — no course/user fixture');
    }
  } else {
    console.log('SKIP DB insert cases — run server bootstrap or tests_strict_enum_constraints.sql');
  }
}

console.log('Test enum enforcement verification complete.');
