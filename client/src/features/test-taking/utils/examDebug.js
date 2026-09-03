/**
 * Development-only exam diagnostics. Never used as a substitute for real error UI.
 * @param {string} event
 * @param {Record<string, unknown>} [payload]
 */
export function logExamDebug(event, payload = {}) {
  try {
    if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return;
    // eslint-disable-next-line no-console
    console.info(`[exam] ${event}`, payload);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} event
 * @param {unknown} err
 * @param {Record<string, unknown>} [payload]
 */
export function logExamError(event, err, payload = {}) {
  try {
    if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return;
    // eslint-disable-next-line no-console
    console.error(`[exam] ${event}`, {
      message: err instanceof Error ? err.message : String(err),
      status: err?.status ?? err?.statusCode ?? null,
      errorCode: err?.errorCode ?? err?.code ?? null,
      ...payload,
    });
  } catch {
    /* ignore */
  }
}
