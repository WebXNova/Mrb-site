/**
 * Reject a promise if it does not settle within `ms`.
 * Does not abort the underlying request — used to unblock UI.
 *
 * @param {Promise<unknown>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<unknown>}
 */
export function withTimeout(promise, ms, message = 'Request timed out') {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const err = new Error(message);
      err.status = 408;
      err.isTimeout = true;
      reject(err);
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}
