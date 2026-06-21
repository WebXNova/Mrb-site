/**
 * Admin secret-path gate verification.
 * Run from server directory: node scripts/verify-admin-secret-path.mjs
 */
import 'dotenv/config';
import {
  __resetAdminSecretPathConfigForTests,
  getAdminApiMountPath,
  getAdminSecretPathSegment,
} from '../src/config/adminSecretPath.config.js';
import {
  adminSecretPathGate,
  isAdminApiPathWithValidSecret,
} from '../src/middleware/adminSecretPathGate.js';

const VALID_SEGMENT = process.env.ADMIN_SECRET_PATH || 'test-secret-segment16';

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function runGate(path, method = 'GET') {
  const req = { path, method, requestId: 'test-req' };
  const res = mockRes();
  let nextCalled = false;
  adminSecretPathGate(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, statusCode: res.statusCode, body: res.body };
}

process.env.ADMIN_SECRET_PATH = VALID_SEGMENT;
__resetAdminSecretPathConfigForTests();

const mount = getAdminApiMountPath();
const segment = getAdminSecretPathSegment();

assert(mount === `/api/admin/${segment}`, `mount path is /api/admin/<secret> (got ${mount})`);

const validLogin = runGate(`${mount}/auth/login`, 'POST');
assert(validLogin.nextCalled, 'valid secret login path passes gate');

const validUsers = runGate(`${mount}/users`);
assert(validUsers.nextCalled, 'valid secret users path passes gate');

const invalidLogin = runGate('/api/admin/login', 'POST');
assert(!invalidLogin.nextCalled && invalidLogin.statusCode === 404, '/api/admin/login returns 404');

const invalidUsers = runGate('/api/admin/users');
assert(!invalidUsers.nextCalled && invalidUsers.statusCode === 404, '/api/admin/users returns 404');

const invalidCourses = runGate('/api/admin/courses');
assert(!invalidCourses.nextCalled && invalidCourses.statusCode === 404, '/api/admin/courses returns 404');

const wrongSecret = runGate('/api/admin/wrong-secret-segment/users');
assert(!wrongSecret.nextCalled && wrongSecret.statusCode === 404, 'wrong secret returns 404');

const bareAdmin = runGate('/api/admin');
assert(!bareAdmin.nextCalled && bareAdmin.statusCode === 404, '/api/admin returns 404');

const oldDirectMount = runGate(`/api/${segment}/users`);
assert(!oldDirectMount.nextCalled && oldDirectMount.statusCode === 404, 'legacy /api/<secret>/users returns 404');

const legacyAdminApi = runGate('/api/admin/dashboard');
assert(!legacyAdminApi.nextCalled && legacyAdminApi.statusCode === 404, '/api/admin/dashboard (no secret) returns 404');

assert(
  isAdminApiPathWithValidSecret(`${mount}/auth/login`),
  'isAdminApiPathWithValidSecret accepts valid path'
);
assert(!isAdminApiPathWithValidSecret('/api/admin/login'), 'isAdminApiPathWithValidSecret rejects invalid path');

const notFoundBody = invalidLogin.body;
assert(notFoundBody?.error?.code === 'NOT_FOUND', 'error code is generic NOT_FOUND');
assert(!JSON.stringify(notFoundBody).includes(segment), '404 body does not expose secret');

console.log('verify-admin-secret-path: OK', {
  mountPattern: '/api/admin/<ADMIN_SECRET_PATH>',
  segmentLength: segment.length,
});
