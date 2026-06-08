import { studentApi } from '../../../api/studentApi';

export const testHistoryApi = {
  fetchHistory: (params) => studentApi.testHistory(params),
};
