import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const config = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  multipleStatements: true,
};

async function main() {
  const connection = await mysql.createConnection(config);
  try {
    const [columns] = await connection.query('SHOW COLUMNS FROM users');
    const names = new Set(columns.map((row) => row.Field));
    const statements = [];

    if (!names.has('google_sub')) {
      statements.push(`ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL`);
      statements.push(`ALTER TABLE users ADD COLUMN google_sub VARCHAR(255) NULL AFTER password_hash`);
    }
    if (!names.has('avatar_url')) {
      statements.push(`ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL AFTER full_name`);
    }
    if (!names.has('google_sub')) {
      statements.push(`ALTER TABLE users ADD UNIQUE KEY uq_users_google_sub (google_sub)`);
    }

    if (!statements.length) {
      console.log('users_google_oauth migration already applied');
      return;
    }

    for (const sql of statements) {
      await connection.query(sql);
      console.log('OK:', sql);
    }

    const [after] = await connection.query('SHOW COLUMNS FROM users');
    console.log('Columns:', after.map((row) => row.Field).join(', '));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
