#!/usr/bin/env node
/**
 * H-04/H-05 webhook replay hardening migration runner.
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { ensureProcessedWebhooksSchema } from '../src/db/ensureProcessedWebhooksSchema.js';

async function main() {
  try {
    const result = await ensureProcessedWebhooksSchema(mysqlPool, {
      dryRun: process.argv.includes('--dry-run'),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
