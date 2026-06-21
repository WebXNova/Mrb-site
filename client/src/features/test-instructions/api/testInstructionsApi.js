import { testsApi } from '../../../api/adminApi';

export const testInstructionsApi = {
  fetchMeta: (slug) => testsApi.getPublicTestMeta(slug),
  fetchPrep: (slug) => testsApi.getTestPrep(slug),
  startTest: (slug, payload) => testsApi.verifyCode(slug, payload),
};
