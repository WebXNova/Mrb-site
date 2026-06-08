import { asyncHandler } from '../utils/asyncHandler.js';
import { getStudentTestHistory } from '../services/studentTestHistory.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

/**
 * GET /api/student/test-history
 * Query: page, pageSize, search, status (all|pass|fail)
 */
export const getStudentTestHistoryHandler = asyncHandler(async (req, res) => {
  const data = await getStudentTestHistory(req.user.id, {
    page: req.query.page,
    pageSize: req.query.pageSize,
    search: req.query.search,
    status: req.query.status,
  });
  sendSuccess(res, data);
});
