import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listMonitoringQuestions,
} from '../services/qaMonitoring.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { rejectAdminQaWrite } from './adminQaMonitoring.controller.js';

export const getAdminStudentQuestions = asyncHandler(async (req, res) => {
  const subject = req.query.subject || 'all';
  const filters = subject && subject !== 'all' ? { subject } : {};
  const data = await listMonitoringQuestions(filters, { page: 1, limit: 100 });
  res.setHeader('X-Deprecated-Endpoint', 'Use /qa-monitoring/questions for paginated monitoring');
  sendSuccess(res, data.items);
});

export const putAdminStudentQuestionAnswer = rejectAdminQaWrite;

export const deleteAdminStudentQuestion = rejectAdminQaWrite;
