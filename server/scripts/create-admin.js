import bcrypt from 'bcryptjs';
import db from '../db.js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

async function createAdmin() {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ADMIN_BOOTSTRAP !== 'true') {
      throw new Error('Admin bootstrap is blocked in production unless ALLOW_ADMIN_BOOTSTRAP=true');
    }

    const email = requiredEnv('ADMIN_EMAIL').toLowerCase();
    const username = requiredEnv('ADMIN_USERNAME').toLowerCase();
    const password = requiredEnv('ADMIN_PASSWORD');
    if (password.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    }

    const hash = await bcrypt.hash(password, 12);

    await db.query(
      `INSERT INTO users (email, username, password_hash, full_name, role, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         password_hash = VALUES(password_hash),
         full_name = VALUES(full_name),
         role = VALUES(role),
         status = VALUES(status)`,
      [email, username, hash, 'System Admin', 'admin', 'active']
    );

    console.log(`Admin user created/updated successfully: ${email}`);
  } catch (error) {
    console.error('Failed to create admin user:', error.message);
    process.exitCode = 1;
  } finally {
    await db.close().catch(() => {});
  }
}

createAdmin();
