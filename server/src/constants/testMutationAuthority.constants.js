/**
 * Authorized admin test mutation routes (PATCH-8 single API authority).
 * Read-only, export, and question-composition routes are separate.
 */

export const AUTHORIZED_TEST_SHELL_MUTATIONS = Object.freeze([
  { method: 'POST', path: '/admin/tests', handler: 'postTest' },
  { method: 'PATCH', path: '/admin/tests/:testId/basic-info', handler: 'patchTestBasicInfo' },
  { method: 'PATCH', path: '/admin/tests/:testId/rules', handler: 'patchTestRules' },
  { method: 'PATCH', path: '/admin/tests/:testId/settings', handler: 'patchTestSettings' },
  { method: 'POST', path: '/admin/tests/:testId/publish', handler: 'postTestPublish' },
]);

export const AUTHORIZED_TEST_QUESTION_MUTATIONS = Object.freeze([
  { method: 'POST', path: '/admin/tests/:testId/questions', handler: 'postLinkTestQuestion' },
  { method: 'DELETE', path: '/admin/tests/:testId/questions', handler: 'deleteBulkUnlinkTestQuestions' },
  { method: 'DELETE', path: '/admin/tests/:testId/questions/:questionId', handler: 'deleteUnlinkTestQuestion' },
  { method: 'PUT', path: '/admin/tests/:testId/questions/reorder', handler: 'putReorderTestQuestions' },
]);

/** Permanently disabled — must not mutate tests. */
export const DISABLED_TEST_MUTATION_ROUTES = Object.freeze([
  { method: 'PUT', path: '/admin/tests/:testId', handler: 'putTest' },
  { method: 'PUT', path: '/admin/tests/:testId/publish', handler: 'putTestPublish' },
]);
