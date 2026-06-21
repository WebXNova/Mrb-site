#!/usr/bin/env node
/**
 * Manual / cron entrypoint for processed_webhooks retention.
 *
 * Usage:
 *   node scripts/run-processed-webhooks-retention.mjs
 *   node scripts/run-processed-webhooks-retention.mjs --dry-run
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { runProcessedWebhooksRetention } from '../src/services/processedWebhooksRetention.service.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const summary = await runProcessedWebhooksRetention({ dryRun, pool: mysqlPool });
  console.log(JSON.stringify(summary, null, 2));
  await mysqlPool.end();
}

main().catch((error) => {
  console.error('processed-webhooks-retention failed:', error?.message || error);
  process.exit(1);
});
