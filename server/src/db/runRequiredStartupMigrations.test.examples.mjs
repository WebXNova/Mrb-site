/**
 * Required startup migration runner tests.
 * Run: npm run test:startup-migrations
 */
import {
  REQUIRED_STARTUP_MIGRATIONS,
  runRequiredStartupMigrations,
} from './runRequiredStartupMigrations.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

async function expectReject(fn, messageIncludes) {
  try {
    await fn();
    failed += 1;
    console.error(`  ✗ expected rejection containing "${messageIncludes}"`);
  } catch (error) {
    assert(String(error.message).includes(messageIncludes), `rejects: ${messageIncludes}`);
  }
}

console.log('runRequiredStartupMigrations tests\n');

console.log('[required migration registry]');
assert(REQUIRED_STARTUP_MIGRATIONS.length === 3, 'registers three required migrations');
assert(
  REQUIRED_STARTUP_MIGRATIONS[0].id === 'enrollment_user_course_unique',
  'enrollment user+course migration is first'
);
assert(
  REQUIRED_STARTUP_MIGRATIONS[1].id === 'enrollment_one_active_per_user',
  'one active per user migration is second'
);
assert(
  REQUIRED_STARTUP_MIGRATIONS[2].id === 'order_checkout_integrity',
  'order checkout migration is third'
);

console.log('\n[fail fast on skipped migration]');
await expectReject(
  () =>
    runRequiredStartupMigrations(
      {},
      {
        migrations: [
          {
            id: 'test_skipped',
            label: 'Skipped migration',
            run: async () => ({ migration: 'test_skipped', skipped: true, reason: 'orders_missing' }),
          },
        ],
        log: () => {},
        errorLog: () => {},
      }
    ),
  'Startup migration blocked (test_skipped): orders_missing'
);

console.log('\n[fail fast on migration error]');
await expectReject(
  () =>
    runRequiredStartupMigrations(
      {},
      {
        migrations: [
          {
            id: 'test_error',
            label: 'Failing migration',
            run: async () => {
              throw new Error('duplicate key');
            },
          },
        ],
        log: () => {},
        errorLog: () => {},
      }
    ),
  'Startup migration failed (test_error): duplicate key'
);

console.log('\n[logs and verifies successful migration]');
const logs = [];
await runRequiredStartupMigrations(
  {
    query: async (sql) => {
      if (String(sql).includes('INFORMATION_SCHEMA.STATISTICS')) {
        return [[{ n: 1 }]];
      }
      return [[{ n: 0 }]];
    },
  },
  {
    migrations: [
      {
        id: 'enrollment_user_course_unique',
        label: 'Enrollment unique constraint',
        run: async () => ({
          migration: 'enrollment_user_course_unique',
          steps: [{ name: 'add_uq_enrollments_user_course', ok: true }],
        }),
      },
    ],
    log: (message) => logs.push(String(message)),
    errorLog: () => {},
  }
);
assert(logs.some((line) => line.includes('applied')), 'logs applied step summary');
assert(logs.some((line) => line.includes('verified')), 'logs verification');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
