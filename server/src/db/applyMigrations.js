import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Applies pending *.sql files in `src/db/migrations/` in lexicographic order.
 * Each file runs in its own transaction; version key is the filename (e.g. 001_schema_migrations.sql).
 */
export async function applyPendingMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(191) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort();

  for (const name of files) {
    const [existing] = await pool.query('SELECT checksum FROM schema_migrations WHERE version = ? LIMIT 1', [name]);
    const fullPath = path.join(MIGRATIONS_DIR, name);
    const body = await fs.readFile(fullPath, 'utf8');
    const checksum = sha256Hex(body);
    if (existing.length > 0) {
      if (existing[0].checksum !== checksum) {
        throw new Error(
          `Migration checksum mismatch for ${name}: recorded ${existing[0].checksum}, file ${checksum}. Do not edit applied migrations.`
        );
      }
      continue;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query({ sql: body, multipleStatements: true });
      await connection.query('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [name, checksum]);
      await connection.commit();
      console.log(`[db:migrate] applied ${name}`);
    } catch (err) {
      await connection.rollback();
      throw new Error(`Migration failed in ${name}: ${err.message}`);
    } finally {
      connection.release();
    }
  }
}
