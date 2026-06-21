/**
 * Structured logging for MySQL timeout events (acquire / query / transaction).
 */

/**
 * @param {'acquire' | 'query' | 'transaction'} kind
 * @param {Record<string, unknown>} [detail]
 */
export function logMysqlTimeoutEvent(kind, detail = {}) {
  console.warn(
    JSON.stringify({
      tag: '[mysql.timeout]',
      kind,
      at: new Date().toISOString(),
      ...detail,
    })
  );
}
