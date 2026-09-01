import { testsApi } from '../../../api/adminApi';
import { studentApi } from '../../../api/studentApi';
import { isStandaloneRuntimeSession, standaloneTestsApi } from '../../../api/standaloneTestsApi';

function isStandaloneKind(accessKind) {
  return accessKind === 'free_standalone' || accessKind === 'paid_standalone';
}

/** Slug runtime uses testsApi; portal history uses studentApi. */
export const testResultApi = {
  fetchResult: ({ slug, attemptId, accessKind }) =>
    slug
      ? isStandaloneKind(accessKind) || isStandaloneRuntimeSession(slug)
        ? standaloneTestsApi.getResult(slug, attemptId)
        : testsApi.getResult(slug, attemptId)
      : studentApi.resultDetail(attemptId),
};
