/**
 * Authorized admin test mutation routes (PATCH-8 single API authority).
 * Read-only, export, and runtime question reads are separate.
 */

export const AUTHORIZED_TEST_SHELL_MUTATIONS = Object.freeze([
  { method: 'POST', path: '/api/admin/:secretMount/tests', handler: 'postTest' },
  { method: 'PATCH', path: '/api/admin/:secretMount/tests/:testId/basic-info', handler: 'patchTestBasicInfo' },
  { method: 'PATCH', path: '/api/admin/:secretMount/tests/:testId/rules', handler: 'patchTestRules' },
  { method: 'PATCH', path: '/api/admin/:secretMount/tests/:testId/settings', handler: 'patchTestSettings' },
  { method: 'POST', path: '/api/admin/:secretMount/tests/:testId/publish', handler: 'postTestPublish' },
]);

/** Quiz Builder draft APIs — authoring replaces legacy manual linking. */
export const AUTHORIZED_QUIZ_DRAFT_MUTATIONS = Object.freeze([
  { method: 'PUT', path: '/api/admin/:secretMount/tests/:testId/quiz-draft', handler: 'putTestQuizDraftHandler' },
  { method: 'DELETE', path: '/api/admin/:secretMount/tests/:testId/quiz-draft', handler: 'deleteTestQuizDraftHandler' },
]);

/** Permanently disabled — must not mutate tests. */
export const DISABLED_TEST_MUTATION_ROUTES = Object.freeze([
  { method: 'PUT', path: '/api/admin/:secretMount/tests/:testId', handler: 'putTest' },
  { method: 'PUT', path: '/api/admin/:secretMount/tests/:testId/publish', handler: 'putTestPublish' },
  { method: 'POST', path: '/api/admin/:secretMount/tests/:testId/questions', handler: 'postLinkTestQuestion' },
  { method: 'DELETE', path: '/api/admin/:secretMount/tests/:testId/questions', handler: 'deleteBulkUnlinkTestQuestions' },
  { method: 'DELETE', path: '/api/admin/:secretMount/tests/:testId/questions/:questionId', handler: 'deleteUnlinkTestQuestion' },
  { method: 'PUT', path: '/api/admin/:secretMount/tests/:testId/questions/reorder', handler: 'putReorderTestQuestions' },
  { method: 'GET', path: '/api/admin/:secretMount/tests/:testId/questions/available', handler: 'getAvailableTestQuestions' },
]);
