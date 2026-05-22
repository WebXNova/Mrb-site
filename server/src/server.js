import './bootstrapFatalHandlers.js';
import 'dotenv/config';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from './app.js';
import { env } from './config/env.js';
import { verifyMySqlConnection, mysqlPool } from './config/mysql.js';
import { connectRedis } from './config/redis.js';
import { startEmailQueueWorker } from './services/emailQueueWorker.service.js';
import { getEmailProviderStatus } from './services/email.service.js';
import { seedLocationTables } from './services/locationSeed.service.js';
import { ensureEnrollmentAccessSchema } from './db/ensureEnrollmentAccessSchema.js';
import { ensureCourseCatalogSchema } from './db/ensureCourseCatalogSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Strong ref so the process stays alive (avoids edge cases with GC / tooling). */
let activeHttpServer = null;

async function runSchema() {
  const schemaPath = path.join(__dirname, 'sql', 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf-8');
  const statements = schemaSql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const [index, statement] of statements.entries()) {
    try {
      await mysqlPool.query(statement);
    } catch (error) {
      const snippet = statement.slice(0, 140).replace(/\s+/g, ' ');
      throw new Error(`Schema migration failed at statement ${index + 1}: ${snippet}. ${error.message}`);
    }
  }
}

async function hasBaseSchema() {
  const [rows] = await mysqlPool.query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'provinces'
     LIMIT 1`
  );
  return rows.length > 0;
}

async function assertRequiredAuthSchema() {
  const required = [
    ['users', 'token_version'],
    ['users', 'risk_level'],
    ['auth_sessions', 'jti'],
    ['auth_sessions', 'refresh_token_hash'],
    ['auth_sessions', 'previous_refresh_hash'],
    ['auth_sessions', 'revoked_at'],
    ['auth_sessions', 'last_used_at'],
    ['auth_sessions', 'last_ip_hash'],
    ['auth_sessions', 'ua_fingerprint'],
  ];
  const [rows] = await mysqlPool.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
         (TABLE_NAME = 'users' AND COLUMN_NAME IN ('token_version', 'risk_level'))
         OR
         (TABLE_NAME = 'auth_sessions' AND COLUMN_NAME IN ('jti', 'refresh_token_hash', 'previous_refresh_hash', 'revoked_at', 'last_used_at', 'last_ip_hash', 'ua_fingerprint'))
       )`
  );
  const existing = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = required
    .map(([table, column]) => `${table}.${column}`)
    .filter((key) => !existing.has(key));
  if (missing.length) {
    throw new Error(`Missing required auth schema columns: ${missing.join(', ')}`);
  }
}

function validateRequiredEnv() {
  const missing = [];
  if (!process.env.JWT_ACCESS_SECRET) missing.push('JWT_ACCESS_SECRET');
  if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
  if (missing.length) {
    throw new Error(`Missing required env variable(s): ${missing.join(', ')}`);
  }

  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (accessSecret.length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
  if (refreshSecret.length < 32) throw new Error('JWT_REFRESH_SECRET must be at least 32 characters');

  for (const [name, value] of [['JWT_ACCESS_SECRET', accessSecret], ['JWT_REFRESH_SECRET', refreshSecret]]) {
    const lowered = value.toLowerCase();
    if (
      lowered.includes('replace') ||
      lowered.includes('secret') ||
      lowered.includes('changeme') ||
      lowered.includes('example')
    ) {
      throw new Error(`${name} appears weak or placeholder-like. Use a strong random secret.`);
    }
  }
}

async function startServer() {
  validateRequiredEnv();

  console.log('MySQL boot config:', {
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_HOST: process.env.MYSQL_HOST,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
  });

  await verifyMySqlConnection();
  const baseSchemaExists = await hasBaseSchema();
  if (!baseSchemaExists && String(process.env.SKIP_SCHEMA_SYNC).toLowerCase() !== 'true') {
    await runSchema();
  } else if (baseSchemaExists) {
    console.log('Schema bootstrap skipped (base schema already present)');
  } else {
    console.warn('Schema sync skipped (SKIP_SCHEMA_SYNC=true)');
  }
  await seedLocationTables(mysqlPool);
  await ensureCourseCatalogSchema(mysqlPool);
  await ensureEnrollmentAccessSchema(mysqlPool);
  await assertRequiredAuthSchema();

  try {
    await connectRedis();
  } catch (error) {
    if (env.nodeEnv === 'production' && env.security.requireRedisInProduction) {
      throw new Error(`Redis connection is required in production: ${error.message}`);
    }
    console.warn('Redis init skipped:', error.message);
  }

  const listenHostRaw = process.env.LISTEN_HOST ? String(process.env.LISTEN_HOST).trim() : '';
  /** Same host semantics for IPv4 vs IPv6; LISTEN_HOST unset = Node default (often :: dual-stack). */
  const listenHost = listenHostRaw || undefined;

  await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.once('error', (err) => {
      if (err?.code === 'EADDRINUSE') {
        console.error(`Port ${env.port} is already in use.${listenHost ? ` (LISTEN_HOST=${listenHost})` : ''}`);
        console.error(`Find PID: netstat -ano | findstr :${env.port}`);
        console.error('Stop it with: taskkill /PID <pid> /F');
      }
      reject(err);
    });
    const onListening = () => {
      const worker = startEmailQueueWorker();
      const emailStatus = getEmailProviderStatus();
      console.log(`[email] Active provider: ${emailStatus.provider}`);
      console.log('[email] Provider config status:', {
        fromConfigured: emailStatus.fromConfigured,
        sendgridConfigured: emailStatus.sendgridConfigured,
        smtpConfigured: emailStatus.smtpConfigured,
        sendgridInitialized: emailStatus.sendgridInitialized,
      });
      console.log('[email] Queue delivery mode:', worker ? 'redis_worker_enabled' : 'direct_send_fallback');
      const suffix = listenHost ? listenHost : 'default bind';
      console.log(`MRB API listening on ${suffix}, port ${env.port} (try http://127.0.0.1:${env.port})`);
      activeHttpServer = server;
      resolve(server);
    };
    if (listenHost) {
      server.listen(env.port, listenHost, onListening);
    } else {
      server.listen(env.port, onListening);
    }
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
});
