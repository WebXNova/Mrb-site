#!/usr/bin/env node
/**
 * Manual / cron entrypoint for activity_logs retention.
 *
 * Usage:
 *   node scripts/run-activity-log-retention.mjs
 *   node scripts/run-activity-log-retention.mjs --dry-run
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { runActivityLogRetention } from '../src/services/activityLogRetention.service.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const summary = await runActivityLogRetention({ dryRun, pool: mysqlPool });
  console.log(JSON.stringify(summary, null, 2));
  await mysqlPool.end();
}

main().catch((error) => {
  console.error('activity-log-retention failed:', error?.message || error);
  process.exit(1);
});
