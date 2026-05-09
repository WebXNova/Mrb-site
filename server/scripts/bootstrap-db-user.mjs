/**
 * One-time: creates MYSQL_DATABASE + MYSQL_USER matching server/.env.
 * Add to server/.env temporarily:
 *   MYSQL_ADMIN_USER=root
 *   MYSQL_ADMIN_PASSWORD=        (empty is OK for root with no password)
 *   MYSQL_ADMIN_PASSWORD=secret  (or your real root password)
 * Then: npm run db:bootstrap
 * Then remove MYSQL_ADMIN_* lines.
 */
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const db = process.env.MYSQL_DATABASE;
const user = process.env.MYSQL_USER;
const pwd = process.env.MYSQL_PASSWORD;
const host = process.env.MYSQL_HOST || '127.0.0.1';
const port = Number(process.env.MYSQL_PORT || 3306);
const adminUser = process.env.MYSQL_ADMIN_USER ?? 'root';

/** When unset, we require admin to set MYSQL_ADMIN_PASSWORD= in .env explicitly (even if empty). */
const adminPwdRaw = process.env.MYSQL_ADMIN_PASSWORD;

function sqlString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function quoteId(name) {
  return `\`${String(name || '').replace(/`/g, '')}\``;
}

function assertRoleLocalPart(name) {
  if (!/^[a-zA-Z0-9_]{1,80}$/.test(String(name || ''))) throw new Error(`Invalid MYSQL_USER: ${name}`);
}

function assertDbName(name) {
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(String(name || ''))) throw new Error(`Invalid MYSQL_DATABASE: ${name}`);
}

async function main() {
  if (adminPwdRaw === undefined) {
    console.error(
      [
        'Add these to server/.env, then rerun:',
        '  MYSQL_ADMIN_USER=root',
        '  MYSQL_ADMIN_PASSWORD=your_root_password_or_empty_for_no_password',
        '',
        '(After success, remove MYSQL_ADMIN_* lines.)',
      ].join('\n')
    );
    process.exit(1);
  }

  if (!db || !user || pwd === undefined || pwd === '') {
    console.error('Set MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD in server/.env first.');
    process.exit(1);
  }

  assertRoleLocalPart(user);
  assertDbName(db);

  const adminPwd = adminPwdRaw;

  console.log(`Connecting admin (${adminUser}) to ${host}:${port} …`);
  const admin = await mysql.createConnection({
    host,
    port,
    user: adminUser,
    password: adminPwd,
    multipleStatements: false,
  });

  await admin.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteId(db)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`Database OK: ${db}`);

  const hosts = ['localhost', '127.0.0.1', '%'];
  for (const h of hosts) {
    await admin.query(`DROP USER IF EXISTS ${sqlString(user)}@${sqlString(h)}`);
    await admin.query(
      `CREATE USER ${sqlString(user)}@${sqlString(h)} IDENTIFIED BY ${sqlString(pwd)}`
    );
    await admin.query(`GRANT ALL PRIVILEGES ON ${quoteId(db)}.* TO ${sqlString(user)}@${sqlString(h)}`);
  }
  console.log(`User ${user} created for: ${hosts.join(', ')}`);

  await admin.query('FLUSH PRIVILEGES');
  await admin.end();

  const test = await mysql.createConnection({
    host,
    port,
    user,
    password: pwd,
    database: db,
  });
  await test.ping();
  await test.end();
  console.log('Login test as app user: OK.');
  console.log('\nRemove MYSQL_ADMIN_USER and MYSQL_ADMIN_PASSWORD from server/.env.');
}

main().catch((e) => {
  console.error('Bootstrap failed:', e.code || '', e.errno || '', e.message);
  process.exit(1);
});
