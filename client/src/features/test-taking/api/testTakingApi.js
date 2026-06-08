import { testsApi } from '../../../api/adminApi';

export const testTakingApi = {
  loadStart: (slug, attemptId, attemptToken) =>
    testsApi.getStartData(slug, attemptId, attemptToken),
  saveAnswer: (slug, attemptId, attemptToken, payload) =>
    testsApi.saveAnswer(slug, attemptId, attemptToken, payload),
  submit: (slug, attemptId, attemptToken) =>
    testsApi.submitAttempt(slug, attemptId, attemptToken),
  resumeAttempt: (slug, studentToken) => testsApi.verifyCode(slug, {}, studentToken),
};
