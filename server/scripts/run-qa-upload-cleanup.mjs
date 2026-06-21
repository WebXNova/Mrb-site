#!/usr/bin/env node
/**
 * Q&A orphan upload cleanup CLI (cron / Railway scheduled task).
 *
 * Usage:
 *   node scripts/run-qa-upload-cleanup.mjs --dry-run
 *   node scripts/run-qa-upload-cleanup.mjs --audit
 *   node scripts/run-qa-upload-cleanup.mjs
 *   node scripts/run-qa-upload-cleanup.mjs --purge-quarantine
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { runQaUploadCleanup } from '../src/services/qaUploadCleanup.service.js';

const args = new Set(process.argv.slice(2));

async function main() {
  const result = await runQaUploadCleanup({
    dryRun: args.has('--dry-run'),
    audit: args.has('--audit'),
    purgeQuarantine: args.has('--purge-quarantine'),
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mysqlPool.end();
  });
