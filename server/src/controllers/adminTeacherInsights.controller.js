import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  teacherInsightsActivityFeedQuerySchema,
  teacherInsightsDashboardQuerySchema,
  teacherInsightsTeacherIdParamSchema,
} from '../validators/teacherInsights.schema.js';
import {
  getTeacherInsightsActivityFeed,
  getTeacherInsightsDetail,
  getTeacherInsightsOverview,
} from '../services/teacherInsights.service.js';

async function auditInsights(req, action, metadata = {}) {
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role || 'admin',
    action: `teacher_insights.${action}`,
    entityType: 'teacher_insights',
    metadata,
  });
}

export const getTeacherInsightsDashboard = asyncHandler(async (req, res) => {
  const parsed = teacherInsightsDashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid dashboard query', parsed.error.flatten());
  }

  const { teacherId } = parsed.data;

  if (teacherId) {
    const detail = await getTeacherInsightsDetail(teacherId);
    const feed = await getTeacherInsightsActivityFeed({ teacherId, page: 1, limit: 20 });
    void auditInsights(req, 'teacher.viewed', { teacherId });
    sendSuccess(res, {
      mode: 'teacher',
      ...detail,
      activityFeed: feed.items,
    });
    return;
  }

  const overview = await getTeacherInsightsOverview();
  void auditInsights(req, 'overview.viewed');
  sendSuccess(res, { mode: 'overview', ...overview });
});

export const getTeacherInsightsActivityFeedHandler = asyncHandler(async (req, res) => {
  const parsed = teacherInsightsActivityFeedQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid activity feed query', parsed.error.flatten());
  }

  const { page, limit, teacherId } = parsed.data;
  const result = await getTeacherInsightsActivityFeed({ teacherId, page, limit });
  sendSuccess(res, result);
});

export const getTeacherInsightsTeacherDetail = asyncHandler(async (req, res) => {
  const parsed = teacherInsightsTeacherIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid teacher id', parsed.error.flatten());
  }

  const detail = await getTeacherInsightsDetail(parsed.data.teacherId);
  void auditInsights(req, 'teacher.detail', { teacherId: parsed.data.teacherId });
  sendSuccess(res, detail);
});
