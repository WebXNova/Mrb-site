/**
 * P2 PATCH-6 — compare tests.subject vs test_subjects before column drop.
 * Run: node scripts/audit-test-subject-legacy.mjs
 */
import { mysqlPool } from '../src/config/mysql.js';

async function columnExists(table, column) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function main() {
  const hasLegacyColumn = await columnExists('tests', 'subject');
  console.log(`tests.subject column present: ${hasLegacyColumn}`);

  const [noMapping] = await mysqlPool.query(
    `SELECT t.id, t.title, t.test_type, t.status,
            TRIM(t.subject) AS legacy_subject
     FROM tests t
     WHERE t.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM test_subjects ts WHERE ts.test_id = t.id)
     ORDER BY t.id ASC`
  );

  console.log(`\nTests with NO test_subjects rows: ${noMapping.length}`);
  for (const row of noMapping.slice(0, 25)) {
    console.log(
      `  #${row.id} ${row.title} type=${row.test_type} status=${row.status} legacy_subject=${row.legacy_subject ?? '(null)'}`
    );
  }
  if (noMapping.length > 25) console.log(`  ... and ${noMapping.length - 25} more`);

  if (hasLegacyColumn) {
    const [mismatch] = await mysqlPool.query(
      `SELECT t.id, t.title, t.test_type, t.status,
              TRIM(t.subject) AS legacy_subject,
              GROUP_CONCAT(s.title ORDER BY s.order_index ASC, s.id ASC SEPARATOR ', ') AS mapped_titles
       FROM tests t
       LEFT JOIN test_subjects ts ON ts.test_id = t.id
       LEFT JOIN subjects s ON s.id = ts.subject_id
       WHERE t.deleted_at IS NULL
       GROUP BY t.id, t.title, t.test_type, t.status, t.subject
       HAVING (
         (TRIM(COALESCE(t.subject, '')) <> '' AND mapped_titles IS NULL)
         OR (
           TRIM(COALESCE(t.subject, '')) <> ''
           AND mapped_titles IS NOT NULL
           AND LOWER(TRIM(t.subject)) <> LOWER(TRIM(mapped_titles))
           AND LOWER(TRIM(t.subject)) NOT IN (
             SELECT LOWER(TRIM(s2.title))
             FROM test_subjects ts2
             INNER JOIN subjects s2 ON s2.id = ts2.subject_id
             WHERE ts2.test_id = t.id
           )
         )
       )
       ORDER BY t.id ASC`
    );

    console.log(`\nLegacy text vs test_subjects title mismatches: ${mismatch.length}`);
    for (const row of mismatch.slice(0, 25)) {
      console.log(
        `  #${row.id} legacy="${row.legacy_subject}" mapped="${row.mapped_titles ?? '(none)'}"`
      );
    }
    if (mismatch.length > 25) console.log(`  ... and ${mismatch.length - 25} more`);
  }

  const [orphanLinks] = await mysqlPool.query(
    `SELECT tq.test_id, COUNT(*) AS orphan_count
     FROM test_questions tq
     LEFT JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE qb.id IS NULL
     GROUP BY tq.test_id
     ORDER BY orphan_count DESC`
  );
  console.log(`\nTests with orphan test_questions (deleted/missing bank): ${orphanLinks.length}`);
  for (const row of orphanLinks.slice(0, 10)) {
    console.log(`  test #${row.test_id}: ${row.orphan_count} orphan link(s)`);
  }

  const blocking = noMapping.length;
  if (blocking > 0) {
    console.log('\nAUDIT: FAIL — backfill test_subjects before dropping tests.subject');
    process.exitCode = 1;
  } else {
    console.log('\nAUDIT: PASS — all tests have test_subjects mappings');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mysqlPool.end());
