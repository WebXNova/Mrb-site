/**
 * Publish in-flight state helpers (G-07).
 */

/**
 * @param {number|string} testId
 */
export function publishBusyKey(testId) {
  return `publish-${testId}`;
}

/**
 * @param {string} busyAction
 * @param {number|string} testId
 */
export function isTestPublishBusy(busyAction, testId) {
  return busyAction === publishBusyKey(testId);
}

/**
 * True while any test publish request is in flight.
 *
 * @param {string} busyAction
 */
export function isAnyPublishBusy(busyAction) {
  return typeof busyAction === 'string' && busyAction.startsWith('publish-');
}

/**
 * @param {string} busyAction
 * @param {number|string} testId
 */
export function publishMenuLabel(busyAction, testId) {
  return isTestPublishBusy(busyAction, testId) ? 'Publishing…' : 'Publish';
}
