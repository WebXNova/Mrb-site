import { testsApi } from '../../../api/adminApi';

export const testInstructionsApi = {
  fetchMeta: (slug) => testsApi.getPublicTestMeta(slug),
  fetchPrep: (slug, studentToken) => testsApi.getTestPrep(slug, studentToken),
  startTest: (slug, payload, studentToken) => testsApi.verifyCode(slug, payload, studentToken),
};
