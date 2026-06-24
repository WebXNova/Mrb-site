import './utils/productionLogFilter.js';
import './bootstrapFatalHandlers.js';
import 'dotenv/config';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from './app.js';
import { env } from './config/env.js';
import { verifyMySqlConnection, mysqlPool, getMysqlPoolConfig } from './config/mysql.js';
import { checkPortInUse } from './utils/checkPortInUse.js';
import { connectRedis, disconnectRedis, isRedisReady } from './config/redis.js';
import { validateTeacherThreadSecretAtStartup } from './security/teacherThreadSecret.js';
import { validateEmailWebhookConfigAtStartup } from './security/emailWebhookConfig.js';
import { startEmailQueueWorker, stopEmailQueueWorker } from './services/emailQueueWorker.service.js';
import { getEmailProviderStatus } from './services/email.service.js';
import { startQaUploadCleanupScheduler } from './jobs/qaUploadCleanupScheduler.js';
import { startProductionCleanupSchedulers } from './jobs/productionCleanupSchedulers.js';
import { seedLocationTables } from './services/locationSeed.service.js';
import { ensureEnrollmentAccessSchema } from './db/ensureEnrollmentAccessSchema.js';
import { ensureEnrollmentSourceSchema } from './db/ensureEnrollmentSourceSchema.js';
import { ensureEnrollmentSwitchConfirmedSchema } from './db/ensureEnrollmentSwitchConfirmedSchema.js';
import { ensureCourseFieldMappingsSchema } from './db/ensureCourseFieldMappingsSchema.js';
import { ensureRemoveDivisionAndEnrollmentBatchSchema } from './db/ensureRemoveDivisionAndEnrollmentBatchSchema.js';
import { runRequiredStartupMigrations } from './db/runRequiredStartupMigrations.js';
import { ensureProcessedWebhooksSchema, ensureProcessedWebhooksRetentionIndex } from './db/ensureProcessedWebhooksSchema.js';
import { ensureTestsCourseSchema } from './db/ensureTestsCourseSchema.js';
import { ensureTestsApplicationSchema } from './db/ensureTestsApplicationSchema.js';
import { ensurePerformanceIndexesSchema } from './db/ensurePerformanceIndexesSchema.js';
import { ensureTestSubjectsSchema } from './db/ensureTestSubjectsSchema.js';
import { ensureTeacherSubjectsSchema } from './db/ensureTeacherSubjectsSchema.js';
import { ensureStudentQuestionsSchema } from './db/ensureStudentQuestionsSchema.js';
import { ensureReviewsSchema } from './db/ensureReviewsSchema.js';
import { ensureContactRemarksPostedSchema } from './db/ensureContactRemarksPostedSchema.js';
import { ensureStudentQuestionsFoundationSchema } from './db/ensureStudentQuestionsFoundationSchema.js';
import { ensureTeacherQaMonitoringSchema } from './db/ensureTeacherQaMonitoringSchema.js';
import { ensureUsersStatusSchema } from './db/ensureUsersStatusSchema.js';
import { ensureTestQuizDraftsSchema } from './db/ensureTestQuizDraftsSchema.js';
import { ensureQuestionImportBatchItemsSchema } from './db/ensureQuestionImportBatchItemsSchema.js';
import { ensureQuestionBankRichHtmlSchema } from './db/ensureQuestionBankRichHtmlSchema.js';
import { ensureTestTransferAuditSchema } from './db/ensureTestTransferAuditSchema.js';
import { ensureExportLogsSchema } from './db/ensureExportLogsSchema.js';
import { ensureStudentStreakSchema } from './db/ensureStudentStreakSchema.js';
import { ensureTestEnumConstraints } from './db/ensureTestEnumConstraints.js';
import { ensureCeeDbConstraints } from './db/ensureCeeDbConstraints.js';
import { ensureCourseDraftsSchema } from './db/ensureCourseDraftsSchema.js';
import { ensureCourseCatalogSchema } from './db/ensureCourseCatalogSchema.js';
import { ensureCourseEnrollmentRefactorSchema } from './db/runEnrollmentRefactorMigration.js';
import { ensureLectureProgressSchema } from './db/ensureLectureProgressSchema.js';
import { ensureLectureGatingSchema } from './db/ensureLectureGatingSchema.js';
import { ensureBatchDateTimeSchema } from './db/ensureBatchDateTimeSchema.js';
import {
  shouldRunProtectionGridStartupValidation,
  validateProtectionGridAtStartup,
} from './security/cee/protectionGridValidator.js';
import {
  isProductionNodeEnv,
  validateProductionStartupConfig,
} from './config/validateProductionStartup.js';
import { validateAdminSecretPathAtStartup } from './config/adminSecretPath.config.js';
import { validateMysqlPoolConfigAtStartup } from './config/mysqlPoolConfig.js';
import { registerGracefulShutdownHandlers } from './utils/registerGracefulShutdownHandlers.js';

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

async function startServer() {
  if (global.__server_started__) {
    console.log('Server already running, skipping duplicate start');
    return;
  }

  validateProductionStartupConfig();
  validateAdminSecretPathAtStartup();
  validateMysqlPoolConfigAtStartup(getMysqlPoolConfig());

  const threadSecrets = validateTeacherThreadSecretAtStartup();
  console.log('[security] TEACHER_THREAD_SECRET validated', {
    previousSecretCount: threadSecrets.previous.length,
  });

  validateEmailWebhookConfigAtStartup();

  const isInUse = await checkPortInUse(env.port);
  if (isInUse) {
    console.error(`Port ${env.port} already in use. Stop other process first.`);
    console.error(`Find PID: netstat -ano | findstr :${env.port}`);
    console.error('Stop it with: taskkill /PID <pid> /F');
    process.exit(1);
  }

  console.log('MySQL boot config:', {
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_HOST: process.env.MYSQL_HOST,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
  });

  try {
    await verifyMySqlConnection();
    console.log('DB Connected');
  } catch (err) {
    console.error('DB Connection Failed:', err?.message || err);
    process.exit(1);
  }
  const baseSchemaExists = await hasBaseSchema();
  if (!baseSchemaExists && String(process.env.SKIP_SCHEMA_SYNC).toLowerCase() !== 'true') {
    await runSchema();
  } else if (baseSchemaExists) {
    console.log('Schema bootstrap skipped (base schema already present)');
  } else {
    console.warn('Schema sync skipped (SKIP_SCHEMA_SYNC=true)');
  }
  await ensureRemoveDivisionAndEnrollmentBatchSchema(mysqlPool);
  await seedLocationTables(mysqlPool);
  await ensureCourseCatalogSchema(mysqlPool);
  await ensureCourseEnrollmentRefactorSchema(mysqlPool);
  await ensureCourseDraftsSchema(mysqlPool);
  await ensureLectureProgressSchema(mysqlPool);
  await ensureLectureGatingSchema(mysqlPool);
  await ensureBatchDateTimeSchema(mysqlPool);
  await ensureEnrollmentAccessSchema(mysqlPool);
  await ensureEnrollmentSourceSchema(mysqlPool);
  await ensureEnrollmentSwitchConfirmedSchema(mysqlPool);
  await ensureCourseFieldMappingsSchema(mysqlPool);
  await runRequiredStartupMigrations(mysqlPool);
  await ensureProcessedWebhooksSchema(mysqlPool);
  await ensureProcessedWebhooksRetentionIndex(mysqlPool);
  await ensureTestsCourseSchema(mysqlPool);
  await ensureTestsApplicationSchema(mysqlPool);
  await ensurePerformanceIndexesSchema(mysqlPool);
  await ensureTestSubjectsSchema(mysqlPool);
  await ensureTeacherSubjectsSchema(mysqlPool);
  await ensureStudentQuestionsSchema(mysqlPool);
  await ensureReviewsSchema(mysqlPool);
  await ensureContactRemarksPostedSchema(mysqlPool);
  await ensureStudentQuestionsFoundationSchema(mysqlPool);
  await ensureTeacherQaMonitoringSchema(mysqlPool);
  await ensureUsersStatusSchema(mysqlPool);
  await ensureTestQuizDraftsSchema(mysqlPool);
  await ensureQuestionImportBatchItemsSchema(mysqlPool);
  await ensureQuestionBankRichHtmlSchema(mysqlPool);
  await ensureTestTransferAuditSchema(mysqlPool);
  await ensureExportLogsSchema(mysqlPool);
  await ensureStudentStreakSchema(mysqlPool);
  await ensureTestEnumConstraints(mysqlPool);
  await ensureCeeDbConstraints(mysqlPool);
  await assertRequiredAuthSchema();

  if (shouldRunProtectionGridStartupValidation()) {
    await validateProtectionGridAtStartup();
    console.log('[CEE.protectionGrid] Startup validation passed (fail-closed grid active).');
  }

  try {
    await connectRedis();
  } catch (error) {
    if (isProductionNodeEnv(env.nodeEnv)) {
      console.error('[startup] Production startup blocked — Redis unavailable:', error?.message || error);
      throw error;
    }
    console.warn('Redis init skipped:', error?.message || error);
  }

  if (isProductionNodeEnv(env.nodeEnv) && !isRedisReady()) {
    throw new Error('Production startup blocked: Redis is required but not ready after connect');
  }

  const listenHostRaw = process.env.LISTEN_HOST ? String(process.env.LISTEN_HOST).trim() : '';
  /** Same host semantics for IPv4 vs IPv6; LISTEN_HOST unset = Node default (often :: dual-stack). */
  const listenHost = listenHostRaw || undefined;

  global.__server_started__ = true;

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
      startQaUploadCleanupScheduler();
      startProductionCleanupSchedulers();
      const suffix = listenHost ? listenHost : 'default bind';
      console.log(`MRB API listening on ${suffix}, port ${env.port} (try http://127.0.0.1:${env.port})`);
      activeHttpServer = server;
      registerGracefulShutdownHandlers(() => activeHttpServer);
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
  process.exit(1);
});
