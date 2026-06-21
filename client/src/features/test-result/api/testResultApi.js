import { studentApi } from '../../../api/studentApi';

/** Canonical portal runtime — CEE entitlement + ownership (G-RT-01). */
export const testResultApi = {
  fetchResult: (attemptId) => studentApi.resultDetail(attemptId),
};
