/**
 * P2 PATCH-7 — audit tests.test_type, category, status before CHECK constraints.
 * Run: node scripts/audit-test-enum-values.mjs
 */
import { mysqlPool } from '../src/config/mysql.js';
import {
  TEST_CATEGORY_VALUES,
  TEST_DB_STATUS_VALUES,
  TEST_TYPE_VALUES,
} from '../src/constants/testMetadata.constants.js';

async function distinctValues(column) {
  const [rows] = await mysqlPool.query(
    `SELECT DISTINCT TRIM(${column}) AS value, COUNT(*) AS cnt
     FROM tests
     WHERE deleted_at IS NULL
     GROUP BY TRIM(${column})
     ORDER BY cnt DESC`
  );
  return rows;
}

function isAllowed(value, allowed) {
  return allowed.includes(String(value ?? '').trim());
}

async function main() {
  const typeRows = await distinctValues('test_type');
  const categoryRows = await distinctValues('category');
  const statusRows = await distinctValues('status');

  const invalidTypes = typeRows.filter((r) => !isAllowed(r.value, TEST_TYPE_VALUES));
  const invalidCategories = categoryRows.filter((r) => !isAllowed(r.value, TEST_CATEGORY_VALUES));
  const invalidStatuses = statusRows.filter((r) => !isAllowed(r.value, TEST_DB_STATUS_VALUES));

  console.log('=== test_type distribution ===');
  for (const row of typeRows) console.log(`  ${row.value ?? '(null)'}: ${row.cnt}`);

  console.log('\n=== category distribution ===');
  for (const row of categoryRows) console.log(`  ${row.value ?? '(null)'}: ${row.cnt}`);

  console.log('\n=== status distribution ===');
  for (const row of statusRows) console.log(`  ${row.value ?? '(null)'}: ${row.cnt}`);

  console.log('\n=== invalid summary ===');
  console.log(`invalid test_type: ${invalidTypes.length} distinct value(s)`);
  for (const row of invalidTypes) console.log(`  - "${row.value}" (${row.cnt} rows)`);

  console.log(`invalid category: ${invalidCategories.length} distinct value(s)`);
  for (const row of invalidCategories) console.log(`  - "${row.value}" (${row.cnt} rows)`);

  console.log(`invalid status: ${invalidStatuses.length} distinct value(s)`);
  for (const row of invalidStatuses) console.log(`  - "${row.value}" (${row.cnt} rows)`);

  const [constraints] = await mysqlPool.query(
    `SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tests'
       AND CONSTRAINT_TYPE = 'CHECK'
     ORDER BY CONSTRAINT_NAME`
  );
  console.log('\n=== CHECK constraints on tests ===');
  for (const row of constraints) console.log(`  ${row.CONSTRAINT_NAME}`);

  if (invalidTypes.length || invalidCategories.length || invalidStatuses.length) {
    console.log('\nAUDIT: FAIL — run normalizeTestEnumRows / migration before adding CHECK constraints');
    process.exitCode = 1;
  } else {
    console.log('\nAUDIT: PASS — all enum values are in allowed sets');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mysqlPool.end());
