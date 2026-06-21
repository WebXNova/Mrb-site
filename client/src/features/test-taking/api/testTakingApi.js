import { testsApi } from '../../../api/adminApi';

/** Slug runtime — attempt JWT sent via HttpOnly cookie + student session cookie. */
export const testTakingApi = {
  loadStart: (slug, attemptId) => testsApi.getStartData(slug, attemptId),
  saveAnswer: (slug, attemptId, payload) => testsApi.saveAnswer(slug, attemptId, payload),
  submit: (slug, attemptId) => testsApi.submitAttempt(slug, attemptId),
  resumeAttempt: (slug) => testsApi.verifyCode(slug, {}),
};
