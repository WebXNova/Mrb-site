import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { applyPendingMigrations } from '../src/db/applyMigrations.js';

async function main() {
  try {
    await applyPendingMigrations(mysqlPool);
    console.log('[db:migrate] done');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await mysqlPool.end();
  }
}

main();
