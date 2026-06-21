/**
 * Teacher Q&A thread identifier HMAC secret — validation, loading, and rotation.
 *
 * No insecure fallbacks. Production and development both require TEACHER_THREAD_SECRET.
 */

const MIN_SECRET_LENGTH = 32;
const MIN_UNIQUE_CHARS = 12;

const WEAK_SUBSTRINGS = Object.freeze([
  'replace',
  'changeme',
  'example',
  'dev-only',
  'password',
  '123456',
  'mrb-teacher',
  'your_',
  'placeholder',
]);

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Validate minimum length, placeholder rejection, and basic entropy.
 *
 * @param {string} name — env var name for error messages
 * @param {string} value
 * @returns {string}
 */
export function validateHmacSecretValue(name, value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing required env variable: ${name}`);
  }

  const secret = String(value);
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  const lowered = secret.toLowerCase();
  for (const fragment of WEAK_SUBSTRINGS) {
    if (lowered.includes(fragment)) {
      throw new Error(`${name} appears weak or placeholder-like. Use a strong random secret.`);
    }
  }

  if (lowered.includes('secret') && secret.length < 48) {
    throw new Error(`${name} appears weak or placeholder-like. Use a strong random secret.`);
  }

  const uniqueChars = new Set(secret).size;
  if (uniqueChars < MIN_UNIQUE_CHARS) {
    throw new Error(
      `${name} has insufficient entropy (${uniqueChars} unique characters; need at least ${MIN_UNIQUE_CHARS})`
    );
  }

  return secret;
}

/**
 * @returns {{ current: string, previous: string[], all: string[] }}
 */
export function loadTeacherThreadSecrets() {
  const current = validateHmacSecretValue(
    'TEACHER_THREAD_SECRET',
    process.env.TEACHER_THREAD_SECRET
  );

  const previous = parseCsv(process.env.TEACHER_THREAD_PREVIOUS_SECRETS).map((value, index) =>
    validateHmacSecretValue(`TEACHER_THREAD_PREVIOUS_SECRETS[${index}]`, value)
  );

  if (previous.includes(current)) {
    throw new Error('TEACHER_THREAD_SECRET must not be listed in TEACHER_THREAD_PREVIOUS_SECRETS');
  }

  const uniquePrevious = [...new Set(previous)];
  if (uniquePrevious.length !== previous.length) {
    throw new Error('TEACHER_THREAD_PREVIOUS_SECRETS contains duplicate values');
  }

  return {
    current,
    previous,
    all: [current, ...previous],
  };
}

/** @type {{ current: string, previous: string[], all: string[] } | null} */
let cachedSecrets = null;

/**
 * Returns validated secrets (loads on first access after startup validation).
 */
export function getTeacherThreadSecrets() {
  if (!cachedSecrets) {
    cachedSecrets = loadTeacherThreadSecrets();
  }
  return cachedSecrets;
}

/**
 * Boot-time validation — call from server.js before accepting traffic.
 * @returns {{ current: string, previous: string[], all: string[] }}
 */
export function validateTeacherThreadSecretAtStartup() {
  const secrets = loadTeacherThreadSecrets();
  cachedSecrets = secrets;
  return secrets;
}

export function resetTeacherThreadSecretsForTests() {
  cachedSecrets = null;
}

export const TEACHER_THREAD_SECRET_REQUIREMENTS = Object.freeze({
  minLength: MIN_SECRET_LENGTH,
  minUniqueChars: MIN_UNIQUE_CHARS,
});
