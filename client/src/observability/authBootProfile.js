import { isAuthDebugEnabled } from '../api/runtimeConfig';

const marks = [];

function enabled() {
  return isAuthDebugEnabled();
}

export function authBootMark(label, meta = {}) {
  if (!enabled()) return;
  const now = performance.now();
  marks.push({ label, atMs: Number(now.toFixed(2)), ...meta });
  // eslint-disable-next-line no-console
  console.info(`[auth-boot] ${label}`, { atMs: Number(now.toFixed(2)), ...meta });
}

export function authBootSpan(label, fn) {
  if (!enabled()) return fn();
  const t0 = performance.now();
  // eslint-disable-next-line no-console
  console.time(`[auth-boot] ${label}`);
  const finish = (outcome) => {
    const ms = Number((performance.now() - t0).toFixed(2));
    // eslint-disable-next-line no-console
    console.timeEnd(`[auth-boot] ${label}`);
    authBootMark(`${label}:${outcome}`, { durationMs: ms });
    return ms;
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => {
          finish('ok');
          return value;
        },
        (error) => {
          finish('error');
          throw error;
        }
      );
    }
    finish('ok');
    return result;
  } catch (error) {
    finish('error');
    throw error;
  }
}

export function authBootSummary() {
  if (!enabled() || !marks.length) return;
  // eslint-disable-next-line no-console
  console.info('[auth-boot] summary', marks);
}
