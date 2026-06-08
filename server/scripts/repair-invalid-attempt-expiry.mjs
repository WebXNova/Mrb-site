/**
 * Repair test_attempts where expires_at <= started_at (timezone corruption).
 *
 * Recalculates expires_at from tests.duration_minutes when possible.
 * Marks unrecoverable rows as expired with completion_reason = 'invalid_timing'.
 *
 * Usage:
 *   node scripts/repair-invalid-attempt-expiry.mjs
 *   node scripts/repair-invalid-attempt-expiry.mjs --dry-run
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const [invalidRows] = await mysqlPool.query(
    `SELECT
       a.id,
       a.test_id,
       a.status,
       a.started_at,
       a.expires_at,
       t.duration_minutes
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id
     WHERE a.expires_at IS NOT NULL
       AND a.started_at IS NOT NULL
       AND a.expires_at <= a.started_at
     ORDER BY a.id`
  );

  console.log(`Found ${invalidRows.length} attempt(s) with expires_at <= started_at`);
  if (!invalidRows.length) {
    await mysqlPool.end();
    return;
  }

  let repaired = 0;
  let markedInvalid = 0;

  for (const row of invalidRows) {
    const duration = Number(row.duration_minutes);
    const canRecalculate = Number.isInteger(duration) && duration > 0;

    if (canRecalculate) {
      console.log(
        `${dryRun ? '[dry-run] ' : ''}Recalculate attempt ${row.id}: +${duration} min from started_at ${row.started_at}`
      );
      if (!dryRun) {
        await mysqlPool.query(
          `UPDATE test_attempts
           SET expires_at = DATE_ADD(started_at, INTERVAL ? MINUTE),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [duration, row.id]
        );
      }
      repaired += 1;
      continue;
    }

    console.log(
      `${dryRun ? '[dry-run] ' : ''}Mark attempt ${row.id} invalid (status=${row.status}, no valid duration)`
    );
    if (!dryRun) {
      await mysqlPool.query(
        `UPDATE test_attempts
         SET status = 'expired',
             completion_reason = 'invalid_timing',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [row.id]
      );
    }
    markedInvalid += 1;
  }

  console.log(`Done. Recalculated: ${repaired}, marked invalid: ${markedInvalid}`);
  await mysqlPool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
