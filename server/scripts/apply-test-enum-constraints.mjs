/**
 * Apply tests enum normalization + CHECK constraints.
 * Run: node scripts/apply-test-enum-constraints.mjs
 */
import 'dotenv/config';
import { verifyMySqlConnection, mysqlPool } from '../src/config/mysql.js';
import { ensureTestEnumConstraints } from '../src/db/ensureTestEnumConstraints.js';

await verifyMySqlConnection();
const result = await ensureTestEnumConstraints(mysqlPool);
console.log(JSON.stringify(result, null, 2));
await mysqlPool.end();
