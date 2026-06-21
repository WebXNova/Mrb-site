/**
 * Observability endpoint access control tests.
 *
 * Run: npm run test:observability-access
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getObservabilityAccessConfig } from '../config/observabilityAccess.config.js';
import {
  evaluateMetricsAccess,
  isMetricsScraperAuthorized,
} from '../middleware/observabilityAccess.util.js';
import {
  optionalAdminContext,
  requireMetricsAccess,
} from '../middleware/observabilityAccess.js';
import {
  buildReadinessResponse,
  shouldExposeOperationalDetails,
} from '../services/observabilityReadiness.service.js';
import { isIpAllowlisted, isIpAllowlistedAny } from '../utils/ipAllowlist.util.js';
import { ApiError } from '../utils/apiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;
const originalNodeEnv = process.env.NODE_ENV;
const originalScraperToken = process.env.METRICS_SCRAPER_TOKEN;
const originalSecureMetrics = process.env.METRICS_SECURE_IN_PRODUCTION;
const originalRestrictDetails = process.env.OPERATIONAL_DETAILS_RESTRICT_IN_PRODUCTION;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected);
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

function mockReq({
  cookies = {},
  authorization = null,
  metricsToken = null,
  ip = '203.0.113.10',
  user = null,
} = {}) {
  const headers = {};
  if (authorization) headers.authorization = authorization;
  if (metricsToken) headers['x-metrics-token'] = metricsToken;
  return {
    cookies,
    headers,
    ip,
    user,
    originalUrl: '/api/metrics',
    path: '/api/metrics',
  };
}

async function invokeMiddleware(middleware, req) {
  let error = null;
  let continued = false;
  await new Promise((resolve) => {
    middleware(req, {}, (err) => {
      error = err ?? null;
      continued = !err;
      resolve();
    });
  });
  return { error, continued };
}

function withProductionEnv(fn) {
  process.env.NODE_ENV = 'production';
  process.env.METRICS_SECURE_IN_PRODUCTION = 'true';
  process.env.OPERATIONAL_DETAILS_RESTRICT_IN_PRODUCTION = 'true';
  try {
    return fn();
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalScraperToken === undefined) delete process.env.METRICS_SCRAPER_TOKEN;
    else process.env.METRICS_SCRAPER_TOKEN = originalScraperToken;
    if (originalSecureMetrics === undefined) delete process.env.METRICS_SECURE_IN_PRODUCTION;
    else process.env.METRICS_SECURE_IN_PRODUCTION = originalSecureMetrics;
    if (originalRestrictDetails === undefined) delete process.env.OPERATIONAL_DETAILS_RESTRICT_IN_PRODUCTION;
    else process.env.OPERATIONAL_DETAILS_RESTRICT_IN_PRODUCTION = originalRestrictDetails;
  }
}

async function withProductionEnvAsync(fn) {
  process.env.NODE_ENV = 'production';
  process.env.METRICS_SECURE_IN_PRODUCTION = 'true';
  process.env.OPERATIONAL_DETAILS_RESTRICT_IN_PRODUCTION = 'true';
  try {
    await fn();
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalScraperToken === undefined) delete process.env.METRICS_SCRAPER_TOKEN;
    else process.env.METRICS_SCRAPER_TOKEN = originalScraperToken;
    if (originalSecureMetrics === undefined) delete process.env.METRICS_SECURE_IN_PRODUCTION;
    else process.env.METRICS_SECURE_IN_PRODUCTION = originalSecureMetrics;
    if (originalRestrictDetails === undefined) delete process.env.OPERATIONAL_DETAILS_RESTRICT_IN_PRODUCTION;
    else process.env.OPERATIONAL_DETAILS_RESTRICT_IN_PRODUCTION = originalRestrictDetails;
  }
}

async function main() {
  console.log('observabilityAccess — endpoint protection tests\n');

  console.log('IP allowlist');
  {
    ok('127.0.0.1 in 127.0.0.0/8', isIpAllowlisted('127.0.0.1', '127.0.0.0/8'));
    ok('10.1.2.3 in 10.0.0.0/8', isIpAllowlisted('10.1.2.3', '10.0.0.0/8'));
    ok('203.0.113.10 not in 10.0.0.0/8', !isIpAllowlisted('203.0.113.10', '10.0.0.0/8'));
    ok('::1 exact match', isIpAllowlistedAny('::1', ['::1', '10.0.0.0/8']));
  }

  console.log('\nMetrics access evaluation — production');
  withProductionEnv(() => {
    const config = getObservabilityAccessConfig();
    ok('metrics secured in production', config.secureMetricsInProduction === true);

    const anonymous = evaluateMetricsAccess(mockReq(), config);
    eq('anonymous external client denied', anonymous.allowed, false);
    eq('anonymous requires admin path', anonymous.reason, 'admin_required');

    const internal = evaluateMetricsAccess(mockReq({ ip: '10.20.30.40' }), config);
    eq('internal network allowed', internal.allowed, true);
    eq('internal reason', internal.reason, 'internal_network');

    process.env.METRICS_SCRAPER_TOKEN = 'metrics-scraper-secret-token-value';
    const scraper = evaluateMetricsAccess(
      mockReq({ metricsToken: 'metrics-scraper-secret-token-value' }),
      getObservabilityAccessConfig()
    );
    eq('scraper token allowed', scraper.allowed, true);
    eq('scraper reason', scraper.reason, 'scraper_token');
    ok(
      'invalid scraper rejected',
      !isMetricsScraperAuthorized(mockReq({ metricsToken: 'wrong' }), getObservabilityAccessConfig())
    );
  });

  console.log('\nMetrics access evaluation — development');
  {
    process.env.NODE_ENV = 'development';
    process.env.METRICS_SECURE_IN_PRODUCTION = 'false';
    const open = evaluateMetricsAccess(mockReq(), getObservabilityAccessConfig());
    eq('development metrics open', open.allowed, true);
    process.env.NODE_ENV = originalNodeEnv;
  }

  console.log('\nMetrics middleware — unauthorized access');
  await withProductionEnvAsync(async () => {
    const anonymous = await invokeMiddleware(requireMetricsAccess, mockReq({ ip: '203.0.113.55' }));
    ok('anonymous metrics request rejected', anonymous.continued === false);
    ok(
      'anonymous metrics returns 401',
      anonymous.error instanceof ApiError && anonymous.error.statusCode === 401
    );

    const studentReq = mockReq({
      ip: '203.0.113.55',
      cookies: { student_access_token: 'student-token' },
    });
    const studentAttempt = await invokeMiddleware(requireMetricsAccess, studentReq);
    ok('student metrics request rejected', studentAttempt.continued === false);
    ok(
      'student metrics returns auth error',
      studentAttempt.error instanceof ApiError &&
        (studentAttempt.error.statusCode === 401 || studentAttempt.error.statusCode === 403)
    );

    const internal = await invokeMiddleware(
      requireMetricsAccess,
      mockReq({ ip: '192.168.1.50' })
    );
    ok('internal metrics scrape allowed', internal.continued === true);
  });

  console.log('\nReadiness response — information leakage');
  withProductionEnv(() => {
    const publicReq = mockReq({ ip: '203.0.113.77', originalUrl: '/api/ready', path: '/api/ready' });
    ok('public client hides operational details', shouldExposeOperationalDetails(publicReq) === false);

    const publicNotReady = buildReadinessResponse(publicReq, { redis: false, mysql: true, emailQueue: true });
    eq('public not-ready status 503', publicNotReady.statusCode, 503);
    ok('public body has no redis key', publicNotReady.body.ready === false);
    ok(
      'public body is boolean readiness only',
      typeof publicNotReady.body.ready === 'boolean' && publicNotReady.body.redis === undefined
    );

    const publicDbDown = buildReadinessResponse(publicReq, { redis: true, mysql: false, emailQueue: true });
    eq('public not-ready when mysql down', publicDbDown.statusCode, 503);
    ok('public db-down body is boolean only', publicDbDown.body.ready === false);

    const internalReq = mockReq({ ip: '10.0.0.12', originalUrl: '/api/ready', path: '/api/ready' });
    ok('internal client sees operational details', shouldExposeOperationalDetails(internalReq) === true);

    const internalDetails = buildReadinessResponse(internalReq, { redis: false, mysql: true, emailQueue: true });
    ok('internal body exposes redis flag', internalDetails.body.ready?.redis === false);
    ok('internal body exposes mysql flag', internalDetails.body.ready?.mysql === true);
    ok('internal body exposes emailQueue flag', internalDetails.body.ready?.emailQueue === true);

    const internalDbDown = buildReadinessResponse(internalReq, { redis: true, mysql: false, emailQueue: true });
    eq('internal not-ready when mysql down', internalDbDown.statusCode, 503);
    ok('internal db-down exposes mysql flag', internalDbDown.body.ready?.mysql === false);

    const internalReady = buildReadinessResponse(internalReq, { redis: true, mysql: true, emailQueue: true });
    eq('internal ready when redis and mysql up', internalReady.statusCode, 200);

    const adminReq = {
      ...mockReq({ ip: '203.0.113.77', originalUrl: '/api/ready', path: '/api/ready' }),
      user: { role: 'admin', id: 1 },
    };
    ok('admin user sees operational details', shouldExposeOperationalDetails(adminReq) === true);
  });

  console.log('\nHealth endpoint — public-safe payload');
  {
    mustContain('src/app.js', ["sendSuccess(res, { status: 'ok' }"], 'health minimal response');
  }

  console.log('\nWiring');
  mustContain(
    'src/app.js',
    ['requireMetricsAccess', 'optionalAdminContext', 'buildReadinessResponse', 'probeMySqlReadiness'],
    'app.js observability guards'
  );
  mustContain(
    'src/security/cee/protectionGrid.js',
    ["policy: 'admin_delegated', label: 'metrics'"],
    'metrics grid policy'
  );
  mustContain(
    '.env.example',
    ['METRICS_SECURE_IN_PRODUCTION', 'METRICS_SCRAPER_TOKEN', 'OBSERVABILITY_INTERNAL_CIDRS'],
    'env documentation'
  );

  console.log('\nOptional admin context — never blocks probes');
  {
    const probe = await invokeMiddleware(optionalAdminContext, mockReq({ ip: '203.0.113.1' }));
    ok('optional admin context continues anonymous probe', probe.continued === true);
  }

  process.env.NODE_ENV = originalNodeEnv;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
