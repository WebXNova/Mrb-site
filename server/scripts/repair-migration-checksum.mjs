/**
 * Syncs `schema_migrations.checksum` to the current SHA-256 of a migration file.
 * Use when a migration file was edited after apply (e.g. comments only) and the
 * server refuses to start with "checksum mismatch".
 *
 * Usage (from server/):
 *   node scripts/repair-migration-checksum.mjs 005_course_batches.sql
 *
 * Requires the same MYSQL_* env as db:migrate.
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool } from '../src/config/mysql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '../src/db/migrations');

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function main() {
  const name = process.argv[2] || '005_course_batches.sql';
  if (!/^\d{3}_[a-z0-9_]+\.sql$/i.test(name)) {
    console.error('Usage: node scripts/repair-migration-checksum.mjs <filename.sql>');
    process.exit(1);
  }
  const fullPath = path.join(MIGRATIONS_DIR, name);
  const body = await fs.readFile(fullPath, 'utf8');
  const checksum = sha256Hex(body);

  const [rows] = await mysqlPool.query('SELECT checksum FROM schema_migrations WHERE version = ? LIMIT 1', [name]);
  if (!rows.length) {
    console.error(`No row in schema_migrations for ${name}; nothing to repair.`);
    process.exit(1);
  }
  const prev = rows[0].checksum;
  if (prev === checksum) {
    console.log(`[repair-migration-checksum] ${name} already matches (${checksum}).`);
    process.exit(0);
  }

  await mysqlPool.query('UPDATE schema_migrations SET checksum = ? WHERE version = ?', [checksum, name]);
  console.log(`[repair-migration-checksum] ${name}`);
  console.log(`  previous: ${prev}`);
  console.log(`  updated:  ${checksum}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => mysqlPool.end());
