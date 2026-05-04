import 'dotenv/config';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from './app.js';
import { env } from './config/env.js';
import { verifyMySqlConnection, mysqlPool } from './config/mysql.js';
import { connectRedis } from './config/redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function ensurePortAvailable(port) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Please stop the existing server process first.`));
        return;
      }
      reject(error);
    });
    tester.once('listening', () => {
      tester.close(() => resolve());
    });
    tester.listen(port, '0.0.0.0');
  });
}

async function startServer() {
  console.log('MySQL boot config:', {
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_HOST: process.env.MYSQL_HOST,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
  });

  await verifyMySqlConnection();
  if (String(process.env.SKIP_SCHEMA_SYNC).toLowerCase() !== 'true') {
    await runSchema();
  } else {
    console.warn('Schema sync skipped (SKIP_SCHEMA_SYNC=true)');
  }

  try {
    await connectRedis();
  } catch (error) {
    if (env.nodeEnv === 'production' && env.security.requireRedisInProduction) {
      throw new Error(`Redis connection is required in production: ${error.message}`);
    }
    console.warn('Redis init skipped:', error.message);
  }

  await ensurePortAvailable(env.port);

  app.listen(env.port, () => {
    console.log(`MRB API running on http://localhost:${env.port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
});
