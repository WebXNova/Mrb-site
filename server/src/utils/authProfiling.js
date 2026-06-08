import { performance } from 'node:perf_hooks';

/**
 * Server-side auth timing. Enable with AUTH_PROFILE=true (always on in development unless AUTH_PROFILE=false).
 * Logs use request id when `req.requestId` is present (see attachRequestContext).
 */
export function isAuthProfilingEnabled() {
  const flag = String(process.env.AUTH_PROFILE || '').trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV === 'development';
}

function tracePrefix(req, scope) {
  const rid = req?.requestId ? req.requestId.slice(0, 8) : '--------';
  return `[auth-profile rid=${rid}] ${scope}`;
}

/**
 * @param {string} scope
 * @param {import('express').Request} [req]
 */
export function startAuthTrace(scope, req) {
  if (!isAuthProfilingEnabled()) {
    return {
      step() {},
      end() {},
    };
  }

  const prefix = tracePrefix(req, scope);
  const t0 = performance.now();
  let last = t0;
  const steps = [];

  console.time(prefix);

  return {
    step(name, meta) {
      const now = performance.now();
      const delta = now - last;
      last = now;
      const entry = { name, deltaMs: Number(delta.toFixed(2)), totalMs: Number((now - t0).toFixed(2)), ...(meta || {}) };
      steps.push(entry);
      console.info(`${prefix} +${entry.deltaMs}ms (${entry.totalMs}ms total) ${name}`, meta || '');
    },
    end(outcome = 'ok', meta) {
      const totalMs = Number((performance.now() - t0).toFixed(2));
      console.timeEnd(prefix);
      console.info(`${prefix} finished ${outcome} in ${totalMs}ms`, { steps, ...(meta || {}) });
    },
  };
}

/**
 * Wrap an async auth helper with automatic timing.
 * @template T
 * @param {string} scope
 * @param {import('express').Request} [req]
 * @param {() => Promise<T>} fn
 */
export async function profileAuthAsync(scope, req, fn) {
  const trace = startAuthTrace(scope, req);
  try {
    const result = await fn(trace);
    trace.end('ok');
    return result;
  } catch (error) {
    trace.end('error', { message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
