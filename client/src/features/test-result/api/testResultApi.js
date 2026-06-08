import { resultApi } from '../../../api/adminApi';

export const testResultApi = {
  fetchResult: (attemptId) => resultApi.fetchByAttemptId(attemptId),
};
