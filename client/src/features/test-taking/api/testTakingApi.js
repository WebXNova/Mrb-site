import { testsApi } from '../../../api/adminApi';
import { isStandaloneRuntimeSession, standaloneTestsApi } from '../../../api/standaloneTestsApi';
import { isFreeGuestRuntime } from '../../free-session/freeSessionNav';

/** Slug runtime — attempt JWT sent via HttpOnly cookie + student session cookie. */
export const testTakingApi = {
  loadStart: (slug, attemptId) =>
    isFreeGuestRuntime(slug)
      ? standaloneTestsApi.freeSessionStartData(slug, attemptId)
      : isStandaloneRuntimeSession(slug)
        ? standaloneTestsApi.getStartData(slug, attemptId)
        : testsApi.getStartData(slug, attemptId),
  saveAnswer: (slug, attemptId, payload) =>
    isFreeGuestRuntime(slug)
      ? standaloneTestsApi.freeSessionSaveAnswer(slug, attemptId, payload)
      : isStandaloneRuntimeSession(slug)
        ? standaloneTestsApi.saveAnswer(slug, attemptId, payload)
        : testsApi.saveAnswer(slug, attemptId, payload),
  submit: (slug, attemptId) =>
    isFreeGuestRuntime(slug)
      ? standaloneTestsApi.freeSessionSubmitAttempt(slug, attemptId)
      : isStandaloneRuntimeSession(slug)
        ? standaloneTestsApi.submitAttempt(slug, attemptId)
        : testsApi.submitAttempt(slug, attemptId),
  resumeAttempt: (slug) =>
    isFreeGuestRuntime(slug)
      ? standaloneTestsApi.freeSessionStatus(slug)
      : isStandaloneRuntimeSession(slug)
        ? standaloneTestsApi.verifyCode(slug, {})
        : testsApi.verifyCode(slug, {}),
  reportIntegrityEvent: (slug, attemptId) =>
    isFreeGuestRuntime(slug)
      ? standaloneTestsApi.freeSessionIntegrityEvent(slug, attemptId)
      : isStandaloneRuntimeSession(slug)
        ? standaloneTestsApi.reportIntegrityEvent(slug, attemptId)
        : testsApi.reportIntegrityEvent(slug, attemptId),
};
