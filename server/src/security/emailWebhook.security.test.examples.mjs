/**
 * SEC-002 — Email provider webhook security regression + attack simulation.
 * Run: node src/security/emailWebhook.security.test.examples.mjs
 */
import crypto from 'crypto';
import { env } from '../config/env.js';
import {
  getEmailWebhookEnvConfig,
  getEmailWebhookRuntimeConfig,
  resetEmailWebhookConfigForTests,
  validateEmailWebhookConfigAtStartup,
} from './emailWebhookConfig.js';
import {
  buildEmailWebhookDedupeDigest,
  verifyEmailWebhookRequest,
} from '../services/emailWebhookAuth.service.js';
import { emailFeedbackPayloadSchema } from '../services/emailWebhookFeedback.service.js';
import { sanitizeMetadata } from '../utils/logSanitizer.js';

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function attack(name, fn) {
  try {
    fn();
    console.log(`  [EXPLOITABLE] ${name}: no error thrown`);
    ok(name, false);
  } catch (error) {
    const blocked = Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600;
    console.log(`  [${blocked ? 'BLOCKED' : 'FAIL'}] ${name}: ${error?.message || error}`);
    ok(name, blocked);
  }
}

const SHARED = 'k7Hn2pQ9mXw4vR8sT1uY6zA3bC5dE0fG2hJ4lM8nP1qR7sT';
const SIGNING = 'w9Zx2Cv5Bn8Mq4Lp7Ks1Hj3Fg6Rd0Ty5Ue8Iw2Oa9Sd3Xv7';

function withTestEnv(overrides, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEmailWebhookConfigForTests();
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEmailWebhookConfigForTests();
  }
}

console.log('emailWebhook — SEC-002 security tests\n');

console.log('Phase 1 — Root cause: env.queue must always be defined');
ok('env.queue exists', env.queue != null && typeof env.queue === 'object');
ok('env.queue.emailQueueName is string', typeof env.queue.emailQueueName === 'string');
ok('env.queue.emailWebhookToleranceSeconds is number', Number.isFinite(env.queue.emailWebhookToleranceSeconds));

console.log('\nPhase 2 — Safe config accessors (no undefined crash)');
withTestEnv(
  {
    EMAIL_WEBHOOK_ENABLED: 'true',
    EMAIL_WEBHOOK_SECRET: SHARED,
    EMAIL_WEBHOOK_SIGNATURE_SECRET: SIGNING,
    NODE_ENV: 'test',
  },
  () => {
    const cfg = getEmailWebhookEnvConfig();
    ok('getEmailWebhookEnvConfig never throws', cfg.enabled === true);
    const runtime = validateEmailWebhookConfigAtStartup();
    ok('runtime config operational with secrets', runtime.operational === true);
  }
);

console.log('\nPhase 3 — Auth verification');
withTestEnv(
  {
    EMAIL_WEBHOOK_ENABLED: 'true',
    EMAIL_WEBHOOK_SECRET: SHARED,
    EMAIL_WEBHOOK_SIGNATURE_SECRET: SIGNING,
    NODE_ENV: 'test',
  },
  () => {
    validateEmailWebhookConfigAtStartup();
    const body = JSON.stringify({ email: 'victim@example.com', event: 'bounce' });
    const rawBody = Buffer.from(body, 'utf8');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', SIGNING)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    const baseReq = {
      get(name) {
        const map = {
          'x-email-webhook-secret': SHARED,
          'x-email-webhook-timestamp': String(timestamp),
          'x-email-webhook-signature': signature,
        };
        return map[name] ?? null;
      },
    };

    try {
      verifyEmailWebhookRequest(baseReq, { rawBody });
      ok('valid signed request accepted', true);
    } catch {
      ok('valid signed request accepted', false);
    }

    attack('missing secret header', () => {
      const req = {
        get(name) {
          if (name === 'x-email-webhook-secret') return '';
          return baseReq.get(name);
        },
      };
      verifyEmailWebhookRequest(req, { rawBody });
    });

    attack('wrong secret', () => {
      const req = {
        get(name) {
          if (name === 'x-email-webhook-secret') return 'wrong-secret-value-xxxxxxxxxxxxxxxxxxxxxxxx';
          return baseReq.get(name);
        },
      };
      verifyEmailWebhookRequest(req, { rawBody });
    });

    attack('wrong signature', () => {
      const req = {
        get(name) {
          if (name === 'x-email-webhook-signature') return 'deadbeef'.repeat(8);
          return baseReq.get(name);
        },
      };
      verifyEmailWebhookRequest(req, { rawBody });
    });

    attack('expired timestamp', () => {
      const oldTs = timestamp - 99999;
      const req = {
        get(name) {
          if (name === 'x-email-webhook-timestamp') return String(oldTs);
          if (name === 'x-email-webhook-signature') {
            return crypto.createHmac('sha256', SIGNING).update(`${oldTs}.${body}`).digest('hex');
          }
          return baseReq.get(name);
        },
      };
      verifyEmailWebhookRequest(req, { rawBody });
    });
  }
);

console.log('\nPhase 4 — Payload validation');
{
  const valid = emailFeedbackPayloadSchema.safeParse({ email: 'a@b.co', event: 'bounce' });
  ok('valid payload accepted', valid.success);
  const empty = emailFeedbackPayloadSchema.safeParse({});
  ok('empty payload rejected', !empty.success);
  const huge = emailFeedbackPayloadSchema.safeParse({
    email: 'a@b.co',
    event: 'bounce',
    reason: 'x'.repeat(500),
  });
  ok('oversized reason rejected', !huge.success);
}

console.log('\nPhase 5 — Logging never exposes secrets');
{
  const sanitized = sanitizeMetadata({
    'x-email-webhook-secret': SHARED,
    'x-email-webhook-signature': 'abc123',
    requestId: 'req_test',
  });
  ok('webhook secret redacted in logs', sanitized['x-email-webhook-secret'] === '[REDACTED]');
  ok('webhook signature redacted in logs', sanitized['x-email-webhook-signature'] === '[REDACTED]');
}

console.log('\nPhase 6 — Dedupe digest stability');
{
  const raw = Buffer.from('{"email":"a@b.co","event":"bounce"}');
  const d1 = buildEmailWebhookDedupeDigest({ timestamp: 1, signature: 'sig', rawBody: raw });
  const d2 = buildEmailWebhookDedupeDigest({ timestamp: 1, signature: 'sig', rawBody: raw });
  ok('dedupe digest deterministic', d1 === d2 && d1.length === 64);
}

console.log('\nPhase 7 — Disabled webhook safe runtime');
withTestEnv({ EMAIL_WEBHOOK_ENABLED: 'false', NODE_ENV: 'test' }, () => {
  const runtime = validateEmailWebhookConfigAtStartup();
  ok('disabled webhook not operational', runtime.operational === false);
  ok('disabled reason set', runtime.disabledReason === 'EMAIL_WEBHOOK_ENABLED=false');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
