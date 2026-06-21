import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  qaMonitoringActivityQuerySchema,
  qaMonitoringAnswersQuerySchema,
  qaMonitoringExportQuerySchema,
  qaMonitoringQuestionsQuerySchema,
  qaMonitoringStatsQuerySchema,
} from '../validators/qaMonitoring.schema.js';
import {
  assertAdminQaMonitoringReadOnly,
  exportMonitoringReport,
  getMonitoringQuestionById,
  listMonitoringAnswers,
  listMonitoringQuestions,
  listMonitoringTeacherActivity,
} from '../services/qaMonitoring.service.js';
import { getQaMonitoringStatistics } from '../services/qaMonitoringAnalytics.service.js';

async function auditAdminMonitoringView(req, action, metadata = {}) {
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role || 'admin',
    action: `qa_monitoring.${action}`,
    entityType: 'qa_monitoring',
    metadata,
  });
}

export const getQaMonitoringStatisticsHandler = asyncHandler(async (req, res) => {
  const parsed = qaMonitoringStatsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid statistics query', parsed.error.flatten());
  }

  const stats = await getQaMonitoringStatistics(parsed.data);
  void auditAdminMonitoringView(req, 'statistics.viewed', { filters: parsed.data });
  sendSuccess(res, stats);
});

export const getQaMonitoringQuestions = asyncHandler(async (req, res) => {
  const parsed = qaMonitoringQuestionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid query parameters', parsed.error.flatten());
  }

  const { page, limit, ...filters } = parsed.data;
  const result = await listMonitoringQuestions(filters, { page, limit });
  void auditAdminMonitoringView(req, 'questions.listed', { page, limit, filters });
  sendSuccess(res, result);
});

export const getQaMonitoringQuestionDetail = asyncHandler(async (req, res) => {
  const questionId = Number(req.params.questionId);
  if (!questionId) throw new ApiError(400, 'Invalid question id');

  const question = await getMonitoringQuestionById(questionId);
  if (!question) throw new ApiError(404, 'Question not found');

  void auditAdminMonitoringView(req, 'question.viewed', { questionId });
  sendSuccess(res, question);
});

export const getQaMonitoringAnswers = asyncHandler(async (req, res) => {
  const parsed = qaMonitoringAnswersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid query parameters', parsed.error.flatten());
  }

  const { page, limit, ...filters } = parsed.data;
  const result = await listMonitoringAnswers(filters, { page, limit });
  void auditAdminMonitoringView(req, 'answers.listed', { page, limit, filters });
  sendSuccess(res, result);
});

export const getQaMonitoringTeacherActivity = asyncHandler(async (req, res) => {
  const parsed = qaMonitoringActivityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid query parameters', parsed.error.flatten());
  }

  const { page, limit, ...filters } = parsed.data;
  const result = await listMonitoringTeacherActivity(filters, { page, limit });
  void auditAdminMonitoringView(req, 'activity.listed', { page, limit, filters });
  sendSuccess(res, result);
});

export const getQaMonitoringExport = asyncHandler(async (req, res) => {
  const parsed = qaMonitoringExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid export query', parsed.error.flatten());
  }

  const report = await exportMonitoringReport(parsed.data);
  void auditAdminMonitoringView(req, 'export', {
    type: parsed.data.type,
    format: parsed.data.format,
    limit: parsed.data.limit,
  });

  if (report.format === 'csv') {
    const filename = `qa-monitoring-${parsed.data.type}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(report.content);
    return;
  }

  sendSuccess(res, { rows: report.rows });
});

/** Block legacy admin write endpoints — monitoring is read-only. */
export const rejectAdminQaWrite = asyncHandler(async (req, res) => {
  void auditAdminMonitoringView(req, 'write.denied', {
    method: req.method,
    path: req.originalUrl,
  });
  assertAdminQaMonitoringReadOnly();
});
