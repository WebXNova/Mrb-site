#!/usr/bin/env node
/**
 * Manual / cron entrypoint for idempotency_keys cleanup.
 *
 * Usage:
 *   node scripts/run-idempotency-cleanup.mjs
 *   node scripts/run-idempotency-cleanup.mjs --dry-run
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { runIdempotencyCleanup } from '../src/services/idempotencyCleanup.service.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const summary = await runIdempotencyCleanup({ dryRun, pool: mysqlPool });
  console.log(JSON.stringify(summary, null, 2));
  await mysqlPool.end();
}

main().catch((error) => {
  console.error('idempotency-cleanup failed:', error?.message || error);
  process.exit(1);
});
