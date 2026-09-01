/**
 * Idempotent schema patch: test engine extension (sections, layout, score bands, anti-cheat).
 * Mirrors sql/migrations/test_engine_extension.sql for existing production databases.
 *
 * Fresh installs should use schema.sql; this runs on startup when tables/columns are missing.
 */

const MIGRATION_NAME = 'test_engine_extension';

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function columnExists(pool, db, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(pool, db, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, tableName, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function foreignKeyExists(pool, db, tableName, constraintName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [db, tableName, constraintName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_TEST_SECTIONS_SQL = `
CREATE TABLE IF NOT EXISTS test_sections (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  subject_label VARCHAR(255) NOT NULL,
  subject_id BIGINT NULL,
  divider_content_html LONGTEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_test_sections_test_id (test_id),
  KEY idx_test_sections_test_order (test_id, display_order),
  KEY idx_test_sections_subject_id (subject_id),
  CONSTRAINT fk_ts_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_ts_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_TEST_SCORE_BANDS_SQL = `
CREATE TABLE IF NOT EXISTS test_score_bands (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT NOT NULL,
  min_score DECIMAL(8,2) NOT NULL,
  max_score DECIMAL(8,2) NOT NULL,
  message_html LONGTEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_test_score_bands_test_id (test_id),
  KEY idx_test_score_bands_test_order (test_id, display_order),
  CONSTRAINT fk_tsb_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_TEST_CHEATING_VIOLATIONS_SQL = `
CREATE TABLE IF NOT EXISTS test_cheating_violations (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT NOT NULL,
  violation_number INT NOT NULL,
  violation_type VARCHAR(64) NOT NULL,
  occurred_at DATETIME NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_test_cheating_violations_attempt_id (attempt_id),
  UNIQUE KEY uq_tcv_attempt_violation (attempt_id, violation_number),
  CONSTRAINT fk_tcv_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT chk_tcv_violation_number CHECK (violation_number BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 * @param {{ dryRun?: boolean }} opts
 */
async function ensureTestSectionsTable(pool, db, { dryRun = false } = {}) {
  if (!(await tableExists(pool, db, 'tests'))) return [];
  if (await tableExists(pool, db, 'test_sections')) return [];

  if (dryRun) return [{ action: 'create_table', table: 'test_sections' }];
  await pool.query(CREATE_TEST_SECTIONS_SQL);
  console.log('[schema] Created test_sections');
  return [{ action: 'created_table', table: 'test_sections' }];
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 * @param {{ dryRun?: boolean }} opts
 */
async function ensureTestSectionsSubjectIdColumn(pool, db, { dryRun = false } = {}) {
  if (!(await tableExists(pool, db, 'test_sections'))) return [];
  if (!(await tableExists(pool, db, 'subjects'))) return [];

  const applied = [];

  if (!(await columnExists(pool, db, 'test_sections', 'subject_id'))) {
    if (dryRun) {
      applied.push({ table: 'test_sections', column: 'subject_id', action: 'add_column' });
    } else {
      await pool.query(
        'ALTER TABLE test_sections ADD COLUMN subject_id BIGINT NULL AFTER subject_label'
      );
      applied.push({ table: 'test_sections', column: 'subject_id', action: 'added' });
      console.log('[schema] Added test_sections.subject_id');
    }
  }

  if (!(await indexExists(pool, db, 'test_sections', 'idx_test_sections_subject_id'))) {
    if (dryRun) {
      applied.push({ table: 'test_sections', index: 'idx_test_sections_subject_id', action: 'add_index' });
    } else {
      await pool.query('ALTER TABLE test_sections ADD KEY idx_test_sections_subject_id (subject_id)');
      applied.push({ table: 'test_sections', index: 'idx_test_sections_subject_id', action: 'added' });
      console.log('[schema] Added test_sections.idx_test_sections_subject_id');
    }
  }

  if (!(await foreignKeyExists(pool, db, 'test_sections', 'fk_ts_subject'))) {
    if (dryRun) {
      applied.push({ table: 'test_sections', constraint: 'fk_ts_subject', action: 'add_fk' });
    } else {
      try {
        await pool.query(
          'ALTER TABLE test_sections ADD CONSTRAINT fk_ts_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL'
        );
        applied.push({ table: 'test_sections', constraint: 'fk_ts_subject', action: 'added' });
        console.log('[schema] Added test_sections.fk_ts_subject');
      } catch (error) {
        console.warn('[schema] Could not add test_sections.fk_ts_subject:', error.message);
      }
    }
  }

  return applied;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 * @param {{ dryRun?: boolean }} opts
 */
async function ensureTestsExtensionColumns(pool, db, { dryRun = false } = {}) {
  if (!(await tableExists(pool, db, 'tests'))) return [];

  const applied = [];
  const columns = [
    {
      name: 'layout_mode',
      ddl: "layout_mode ENUM('vertical', 'horizontal') NOT NULL DEFAULT 'vertical' AFTER end_date",
    },
    {
      name: 'display_mode',
      ddl: "display_mode ENUM('all', 'one_per_page') NOT NULL DEFAULT 'all' AFTER layout_mode",
    },
    {
      name: 'results_released_at',
      ddl: "results_released_at DATETIME NULL COMMENT 'When set, students may view results even if show_result_immediately was off at submit time; NULL means use show_result_immediately only' AFTER display_mode",
    },
    {
      name: 'full_page_mode',
      ddl: 'full_page_mode TINYINT(1) NOT NULL DEFAULT 0 AFTER results_released_at',
    },
  ];

  for (const col of columns) {
    if (await columnExists(pool, db, 'tests', col.name)) continue;
    if (dryRun) {
      applied.push({ table: 'tests', column: col.name, action: 'add_column' });
      continue;
    }
    await pool.query(`ALTER TABLE tests ADD COLUMN ${col.ddl}`);
    applied.push({ table: 'tests', column: col.name, action: 'added' });
    console.log(`[schema] Added tests.${col.name}`);
  }

  const richTextColumns = [
    {
      name: 'introduction_html',
      ddl: 'introduction_html LONGTEXT NULL AFTER description',
    },
    {
      name: 'conclusion_html',
      ddl: 'conclusion_html LONGTEXT NULL AFTER introduction_html',
    },
  ];

  for (const col of richTextColumns) {
    if (await columnExists(pool, db, 'tests', col.name)) continue;
    if (dryRun) {
      applied.push({ table: 'tests', column: col.name, action: 'add_column' });
      continue;
    }
    await pool.query(`ALTER TABLE tests ADD COLUMN ${col.ddl}`);
    applied.push({ table: 'tests', column: col.name, action: 'added' });
    console.log(`[schema] Added tests.${col.name}`);
  }

  if (!(await indexExists(pool, db, 'tests', 'idx_tests_results_released_at'))) {
    if (dryRun) {
      applied.push({ table: 'tests', index: 'idx_tests_results_released_at', action: 'add_index' });
    } else {
      await pool.query('ALTER TABLE tests ADD KEY idx_tests_results_released_at (results_released_at)');
      applied.push({ table: 'tests', index: 'idx_tests_results_released_at', action: 'added' });
      console.log('[schema] Added tests.idx_tests_results_released_at');
    }
  }

  if (!dryRun && (await columnExists(pool, db, 'tests', 'layout_mode')) && (await columnExists(pool, db, 'tests', 'display_mode'))) {
    const [syncResult] = await pool.query(
      `UPDATE tests
       SET display_mode = IF(layout_mode = 'horizontal' OR display_mode = 'one_per_page', 'one_per_page', 'all'),
           layout_mode = IF(layout_mode = 'horizontal' OR display_mode = 'one_per_page', 'horizontal', 'vertical')
       WHERE (layout_mode = 'horizontal') <> (display_mode = 'one_per_page')`
    );
    const synced = Number(syncResult?.affectedRows ?? 0);
    if (synced > 0) {
      applied.push({ table: 'tests', action: 'sync_display_mode', rows: synced });
      console.log(`[schema] Synced tests.display_mode with layout_mode (${synced} rows)`);
    }
  }

  return applied;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 * @param {{ dryRun?: boolean }} opts
 */
async function ensureQuestionBankTipColumn(pool, db, { dryRun = false } = {}) {
  if (!(await tableExists(pool, db, 'question_bank'))) return [];
  if (await columnExists(pool, db, 'question_bank', 'tip_html')) return [];

  if (dryRun) return [{ table: 'question_bank', column: 'tip_html', action: 'add_column' }];
  await pool.query(
    'ALTER TABLE question_bank ADD COLUMN tip_html LONGTEXT NULL AFTER explanation_html'
  );
  console.log('[schema] Added question_bank.tip_html');
  return [{ table: 'question_bank', column: 'tip_html', action: 'added' }];
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 * @param {{ dryRun?: boolean }} opts
 */
async function ensureTestQuestionsSectionColumn(pool, db, { dryRun = false } = {}) {
  if (!(await tableExists(pool, db, 'test_questions'))) return [];
  if (!(await tableExists(pool, db, 'test_sections'))) return [];

  const applied = [];

  if (!(await columnExists(pool, db, 'test_questions', 'section_id'))) {
    if (dryRun) {
      applied.push({ table: 'test_questions', column: 'section_id', action: 'add_column' });
    } else {
      await pool.query(
        'ALTER TABLE test_questions ADD COLUMN section_id BIGINT NULL AFTER display_order'
      );
      applied.push({ table: 'test_questions', column: 'section_id', action: 'added' });
      console.log('[schema] Added test_questions.section_id');
    }
  }

  if (!(await indexExists(pool, db, 'test_questions', 'idx_test_questions_section_id'))) {
    if (dryRun) {
      applied.push({
        table: 'test_questions',
        index: 'idx_test_questions_section_id',
        action: 'add_index',
      });
    } else {
      await pool.query(
        'ALTER TABLE test_questions ADD KEY idx_test_questions_section_id (section_id)'
      );
      applied.push({
        table: 'test_questions',
        index: 'idx_test_questions_section_id',
        action: 'added',
      });
      console.log('[schema] Added test_questions.idx_test_questions_section_id');
    }
  }

  if (!(await foreignKeyExists(pool, db, 'test_questions', 'fk_tq_section'))) {
    if (dryRun) {
      applied.push({ table: 'test_questions', constraint: 'fk_tq_section', action: 'add_fk' });
    } else {
      try {
        await pool.query(
          'ALTER TABLE test_questions ADD CONSTRAINT fk_tq_section FOREIGN KEY (section_id) REFERENCES test_sections(id) ON DELETE SET NULL'
        );
        applied.push({ table: 'test_questions', constraint: 'fk_tq_section', action: 'added' });
        console.log('[schema] Added test_questions.fk_tq_section');
      } catch (error) {
        console.warn('[schema] Could not add test_questions.fk_tq_section:', error.message);
      }
    }
  }

  return applied;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 * @param {{ dryRun?: boolean }} opts
 */
async function ensureTestScoreBandsTable(pool, db, { dryRun = false } = {}) {
  if (!(await tableExists(pool, db, 'tests'))) return [];
  if (await tableExists(pool, db, 'test_score_bands')) return [];

  if (dryRun) return [{ action: 'create_table', table: 'test_score_bands' }];
  await pool.query(CREATE_TEST_SCORE_BANDS_SQL);
  console.log('[schema] Created test_score_bands');
  return [{ action: 'created_table', table: 'test_score_bands' }];
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 * @param {{ dryRun?: boolean }} opts
 */
async function ensureTestAttemptsCheatingColumn(pool, db, { dryRun = false } = {}) {
  if (!(await tableExists(pool, db, 'test_attempts'))) return [];
  if (await columnExists(pool, db, 'test_attempts', 'is_flagged_cheating')) return [];

  if (dryRun) {
    return [{ table: 'test_attempts', column: 'is_flagged_cheating', action: 'add_column' }];
  }
  await pool.query(
    'ALTER TABLE test_attempts ADD COLUMN is_flagged_cheating TINYINT(1) NOT NULL DEFAULT 0'
  );
  console.log('[schema] Added test_attempts.is_flagged_cheating');
  return [{ table: 'test_attempts', column: 'is_flagged_cheating', action: 'added' }];
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 * @param {{ dryRun?: boolean }} opts
 */
async function ensureTestCheatingViolationsTable(pool, db, { dryRun = false } = {}) {
  if (!(await tableExists(pool, db, 'test_attempts'))) return [];
  if (await tableExists(pool, db, 'test_cheating_violations')) return [];

  if (dryRun) return [{ action: 'create_table', table: 'test_cheating_violations' }];
  await pool.query(CREATE_TEST_CHEATING_VIOLATIONS_SQL);
  console.log('[schema] Created test_cheating_violations');
  return [{ action: 'created_table', table: 'test_cheating_violations' }];
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureTestEngineExtensionSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };
  }

  const applied = [];

  applied.push(...(await ensureTestSectionsTable(mysqlPool, db, { dryRun })));
  applied.push(...(await ensureTestSectionsSubjectIdColumn(mysqlPool, db, { dryRun })));
  applied.push(...(await ensureTestsExtensionColumns(mysqlPool, db, { dryRun })));
  applied.push(...(await ensureQuestionBankTipColumn(mysqlPool, db, { dryRun })));
  applied.push(...(await ensureTestQuestionsSectionColumn(mysqlPool, db, { dryRun })));
  applied.push(...(await ensureTestScoreBandsTable(mysqlPool, db, { dryRun })));
  applied.push(...(await ensureTestAttemptsCheatingColumn(mysqlPool, db, { dryRun })));
  applied.push(...(await ensureTestCheatingViolationsTable(mysqlPool, db, { dryRun })));

  return {
    migration: MIGRATION_NAME,
    applied: applied.length > 0,
    changes: applied,
    dryRun,
  };
}

/**
 * Rollback helper — mirrors test_engine_extension_rollback.sql (destructive for new tables).
 *
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function rollbackTestEngineExtensionSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database', rollback: true };
  }

  const rolledBack = [];

  if (await tableExists(mysqlPool, db, 'test_cheating_violations')) {
    if (dryRun) rolledBack.push({ action: 'drop_table', table: 'test_cheating_violations' });
    else {
      await mysqlPool.query('DROP TABLE test_cheating_violations');
      rolledBack.push({ action: 'dropped_table', table: 'test_cheating_violations' });
    }
  }

  if (await columnExists(mysqlPool, db, 'test_attempts', 'is_flagged_cheating')) {
    if (dryRun) rolledBack.push({ table: 'test_attempts', column: 'is_flagged_cheating', action: 'drop_column' });
    else {
      await mysqlPool.query('ALTER TABLE test_attempts DROP COLUMN is_flagged_cheating');
      rolledBack.push({ table: 'test_attempts', column: 'is_flagged_cheating', action: 'dropped' });
    }
  }

  if (await tableExists(mysqlPool, db, 'test_score_bands')) {
    if (dryRun) rolledBack.push({ action: 'drop_table', table: 'test_score_bands' });
    else {
      await mysqlPool.query('DROP TABLE test_score_bands');
      rolledBack.push({ action: 'dropped_table', table: 'test_score_bands' });
    }
  }

  if (await foreignKeyExists(mysqlPool, db, 'test_questions', 'fk_tq_section')) {
    if (dryRun) rolledBack.push({ constraint: 'fk_tq_section', action: 'drop_fk' });
    else {
      await mysqlPool.query('ALTER TABLE test_questions DROP FOREIGN KEY fk_tq_section');
      rolledBack.push({ constraint: 'fk_tq_section', action: 'dropped' });
    }
  }

  if (await indexExists(mysqlPool, db, 'test_questions', 'idx_test_questions_section_id')) {
    if (dryRun) rolledBack.push({ index: 'idx_test_questions_section_id', action: 'drop_index' });
    else {
      await mysqlPool.query('ALTER TABLE test_questions DROP INDEX idx_test_questions_section_id');
      rolledBack.push({ index: 'idx_test_questions_section_id', action: 'dropped' });
    }
  }

  if (await columnExists(mysqlPool, db, 'test_questions', 'section_id')) {
    if (dryRun) rolledBack.push({ table: 'test_questions', column: 'section_id', action: 'drop_column' });
    else {
      await mysqlPool.query('ALTER TABLE test_questions DROP COLUMN section_id');
      rolledBack.push({ table: 'test_questions', column: 'section_id', action: 'dropped' });
    }
  }

  if (await columnExists(mysqlPool, db, 'question_bank', 'tip_html')) {
    if (dryRun) rolledBack.push({ table: 'question_bank', column: 'tip_html', action: 'drop_column' });
    else {
      await mysqlPool.query('ALTER TABLE question_bank DROP COLUMN tip_html');
      rolledBack.push({ table: 'question_bank', column: 'tip_html', action: 'dropped' });
    }
  }

  if (await indexExists(mysqlPool, db, 'tests', 'idx_tests_results_released_at')) {
    if (dryRun) rolledBack.push({ index: 'idx_tests_results_released_at', action: 'drop_index' });
    else {
      await mysqlPool.query('ALTER TABLE tests DROP INDEX idx_tests_results_released_at');
      rolledBack.push({ index: 'idx_tests_results_released_at', action: 'dropped' });
    }
  }

  for (const col of [
    'conclusion_html',
    'introduction_html',
    'full_page_mode',
    'results_released_at',
    'display_mode',
    'layout_mode',
  ]) {
    if (await columnExists(mysqlPool, db, 'tests', col)) {
      if (dryRun) rolledBack.push({ table: 'tests', column: col, action: 'drop_column' });
      else {
        await mysqlPool.query(`ALTER TABLE tests DROP COLUMN ${col}`);
        rolledBack.push({ table: 'tests', column: col, action: 'dropped' });
      }
    }
  }

  if (await tableExists(mysqlPool, db, 'test_sections')) {
    if (dryRun) rolledBack.push({ action: 'drop_table', table: 'test_sections' });
    else {
      await mysqlPool.query('DROP TABLE test_sections');
      rolledBack.push({ action: 'dropped_table', table: 'test_sections' });
    }
  }

  return {
    migration: MIGRATION_NAME,
    rollback: true,
    applied: rolledBack.length > 0,
    changes: rolledBack,
    dryRun,
  };
}
