/**
 * Applies tests enum normalization + CHECK constraints (PATCH-7).
 * Parameterized queries only; DDL uses fixed constraint definitions.
 */

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function constraintExists(pool, db, tableName, constraintName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'`,
    [db, tableName, constraintName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function countInvalidTestEnumRows(pool) {
  const [dbRows] = await pool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db || !(await tableExists(pool, db, 'tests'))) {
    return { invalidType: 0, invalidCategory: 0, invalidStatus: 0 };
  }

  const [typeRows] = await pool.query(
    `SELECT COUNT(*) AS n FROM tests
     WHERE deleted_at IS NULL AND test_type NOT IN ('subject_wise', 'mixed_subject')`
  );
  const [catRows] = await pool.query(
    `SELECT COUNT(*) AS n FROM tests WHERE deleted_at IS NULL AND category <> ?`,
    ['MDCAT']
  );
  const [statusRows] = await pool.query(
    `SELECT COUNT(*) AS n FROM tests
     WHERE deleted_at IS NULL
       AND status NOT IN ('INCOMPLETE', 'DRAFT', 'READY_FOR_PUBLISH', 'published')`
  );

  return {
    invalidType: Number(typeRows[0]?.n ?? 0),
    invalidCategory: Number(catRows[0]?.n ?? 0),
    invalidStatus: Number(statusRows[0]?.n ?? 0),
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function normalizeTestEnumRows(pool) {
  await pool.query(
    `UPDATE tests SET category = ? WHERE category IS NULL OR TRIM(category) = '' OR category <> ?`,
    ['MDCAT', 'MDCAT']
  );
  await pool.query(
    `UPDATE tests SET test_type = 'mixed_subject'
     WHERE test_type IS NULL OR TRIM(test_type) = ''
        OR test_type NOT IN ('subject_wise', 'mixed_subject')`
  );
  await pool.query(
    `UPDATE tests SET status = 'published' WHERE UPPER(TRIM(status)) = 'PUBLISHED'`
  );
  await pool.query(
    `UPDATE tests SET status = 'DRAFT'
     WHERE LOWER(TRIM(status)) = 'draft' AND status <> 'published'`
  );
  await pool.query(
    `UPDATE tests SET status = 'INCOMPLETE'
     WHERE status IS NULL OR TRIM(status) = ''
        OR status NOT IN ('INCOMPLETE', 'DRAFT', 'READY_FOR_PUBLISH', 'published')`
  );
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function ensureTestEnumConstraints(pool) {
  const [dbRows] = await pool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db || !(await tableExists(pool, db, 'tests'))) return { applied: false, reason: 'tests_table_missing' };

  await normalizeTestEnumRows(pool);
  const invalid = await countInvalidTestEnumRows(pool);
  if (invalid.invalidType + invalid.invalidCategory + invalid.invalidStatus > 0) {
    console.warn('[schema] Skipping tests CHECK constraints — invalid enum rows remain:', invalid);
    return { applied: false, invalid };
  }

  const checks = [
    {
      name: 'chk_tests_test_type',
      ddl: `ALTER TABLE tests ADD CONSTRAINT chk_tests_test_type CHECK (test_type IN ('subject_wise', 'mixed_subject'))`,
    },
    {
      name: 'chk_tests_category',
      ddl: `ALTER TABLE tests ADD CONSTRAINT chk_tests_category CHECK (category = 'MDCAT')`,
    },
    {
      name: 'chk_tests_status',
      ddl: `ALTER TABLE tests ADD CONSTRAINT chk_tests_status CHECK (status IN ('INCOMPLETE', 'DRAFT', 'READY_FOR_PUBLISH', 'published'))`,
    },
  ];

  for (const chk of checks) {
    if (await constraintExists(pool, db, 'tests', chk.name)) continue;
    await pool.query(chk.ddl);
    console.log(`[schema] Added ${chk.name}`);
  }

  return { applied: true, invalid };
}
