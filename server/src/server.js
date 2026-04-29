import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from './app.js';
import { env } from './config/env.js';
import { verifyMySqlConnection, mysqlPool } from './config/mysql.js';
import { connectMongo } from './config/mongo.js';
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

  for (const statement of statements) {
    await mysqlPool.query(statement);
  }
}

async function startServer() {
  app.listen(env.port, () => {
    console.log(`MRB API running on http://localhost:${env.port}`);
  });

  await verifyMySqlConnection()
    .then(() => runSchema())
    .catch((error) => {
      console.warn('MySQL init skipped:', error.message);
    });

  await connectMongo().catch((error) => {
    console.warn('MongoDB connection skipped:', error.message);
  });
  await connectRedis().catch(() => null);
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
});
