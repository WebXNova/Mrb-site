/**
 * Centralized admin secret-path configuration.
 *
 * ADMIN_SECRET_PATH is loaded only from server-side environment variables.
 * Never log, echo, or return the segment in API responses or error messages.
 *
 * Rotation: set ADMIN_SECRET_PATH_PREVIOUS (comma-separated) during cutover;
 * all listed segments accept admin API/UI routing until the previous value is removed.
 */

const MIN_SEGMENT_LENGTH = 16;
const MAX_SEGMENT_LENGTH = 128;

/** Reserved segments that must not be used as the admin gate. */
const FORBIDDEN_SEGMENTS = new Set([
  'admin',
  'api',
  'auth',
  'login',
  'logout',
  'dashboard',
  'manage',
  'management',
  'panel',
  'console',
  'backend',
  'internal',
  'staff',
  'root',
  'system',
]);

const SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function stripSegment(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^\/+|\/+$/g, '');
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((part) => stripSegment(part))
    .filter(Boolean);
}

/**
 * @param {string} segment
 * @param {string} envKey — label for validation errors (never includes the value)
 */
function assertValidSegment(segment, envKey) {
  if (!segment) {
    throw new Error(`${envKey} is required. Configure a unique secret path segment (minimum ${MIN_SEGMENT_LENGTH} characters).`);
  }

  if (segment.length < MIN_SEGMENT_LENGTH) {
    throw new Error(`${envKey} is too short. Minimum length is ${MIN_SEGMENT_LENGTH} characters.`);
  }

  if (segment.length > MAX_SEGMENT_LENGTH) {
    throw new Error(`${envKey} exceeds maximum length of ${MAX_SEGMENT_LENGTH} characters.`);
  }

  if (!SEGMENT_PATTERN.test(segment)) {
    throw new Error(
      `${envKey} must be a URL-safe path segment (letters, digits, hyphen, underscore; must not start with hyphen).`
    );
  }

  if (FORBIDDEN_SEGMENTS.has(segment.toLowerCase())) {
    throw new Error(`${envKey} uses a forbidden predictable segment. Choose a high-entropy value.`);
  }
}

/** @type {{ primary: string, previous: string[], all: string[] } | null} */
let cachedConfig = null;

function loadConfig() {
  if (cachedConfig) return cachedConfig;

  const primary = stripSegment(process.env.ADMIN_SECRET_PATH);
  assertValidSegment(primary, 'ADMIN_SECRET_PATH');

  const previousRaw = parseCsv(process.env.ADMIN_SECRET_PATH_PREVIOUS);
  for (let i = 0; i < previousRaw.length; i += 1) {
    assertValidSegment(previousRaw[i], `ADMIN_SECRET_PATH_PREVIOUS entry ${i + 1}`);
  }

  const previous = previousRaw.filter((segment) => segment !== primary);
  const all = [primary, ...previous];

  cachedConfig = Object.freeze({
    primary,
    previous: Object.freeze(previous),
    all: Object.freeze(all),
  });

  return cachedConfig;
}

/** Fixed admin API namespace — secret segment follows `/api/admin/`. */
export const ADMIN_API_NAMESPACE = '/api/admin';

/** Primary secret path segment (no leading slash). */
export function getAdminSecretPathSegment() {
  return loadConfig().primary;
}

/** All active segments during rotation windows. */
export function getAdminSecretPathSegments() {
  return loadConfig().all;
}

/** Admin API namespace prefix, e.g. `/api/admin`. */
export function getAdminApiNamespace() {
  return ADMIN_API_NAMESPACE;
}

/**
 * Express mount for the primary admin API surface, e.g. `/api/admin/<segment>`.
 */
export function getAdminApiMountPath() {
  return `${ADMIN_API_NAMESPACE}/${getAdminSecretPathSegment()}`;
}

/** Build API mount for any active segment (rotation). */
export function getAdminApiMountPathForSegment(segment) {
  return `${ADMIN_API_NAMESPACE}/${segment}`;
}

/**
 * @param {string} segment
 * @returns {boolean}
 */
export function isValidAdminSecretSegment(segment) {
  const normalized = stripSegment(segment);
  if (!normalized) return false;
  return getAdminSecretPathSegments().includes(normalized);
}

/** SPA base path for admin UI, e.g. `/<segment>`. */
export function getAdminUiBasePath() {
  return `/${getAdminSecretPathSegment()}`;
}

/**
 * Fail closed before accepting traffic when configuration is invalid.
 * Safe to call multiple times; does not log the secret value.
 */
export function validateAdminSecretPathAtStartup() {
  const config = loadConfig();
  console.log('[startup] Admin secret path configuration validated', {
    segmentCount: config.all.length,
    rotationActive: config.previous.length > 0,
  });
}

/**
 * Whether a request path targets a legacy predictable admin surface.
 * Used by the secret-path gate — returns generic 404, no hint.
 *
 * @param {string} path — req.path (no query)
 */
export function isLegacyPredictableAdminPath(path) {
  const normalized = String(path || '').split('?')[0];

  /** Former direct mount `/api/<secret>/...` (pre `/api/admin/<secret>` architecture). */
  for (const segment of getAdminSecretPathSegments()) {
    const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^/api/${escaped}(?:/|$)`, 'i').test(normalized)) {
      return true;
    }
  }

  if (/^\/api\/enrollments\/admin(?:\/|$)/i.test(normalized)) return true;
  if (normalized === '/api/courses/admin') return true;
  if (/^\/api\/questions(?:\/|$)/i.test(normalized)) return true;
  if (/^\/api\/tests\/[^/]+\/quiz-draft$/i.test(normalized)) return true;

  if (normalized === '/api/auth/login' || normalized === '/api/auth/logout') return true;
  if (normalized === '/api/auth/me') return true;

  return false;
}

/**
 * Reset cached config — test harness only.
 */
export function __resetAdminSecretPathConfigForTests() {
  cachedConfig = null;
}
