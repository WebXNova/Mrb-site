import { asyncHandler } from '../utils/asyncHandler.js';
import {
  adminDeleteStudentQuestion,
  adminUpdateStudentQuestionAnswer,
  listAdminStudentQuestions,
} from '../services/studentQuestions.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

export const getAdminStudentQuestions = asyncHandler(async (req, res) => {
  const subject = req.query.subject || 'all';
  const data = await listAdminStudentQuestions(subject);
  sendSuccess(res, data);
});

export const putAdminStudentQuestionAnswer = asyncHandler(async (req, res) => {
  const updated = await adminUpdateStudentQuestionAnswer(req.user.id, req.params.id, req.body || {});
  sendSuccess(res, updated);
});

export const deleteAdminStudentQuestion = asyncHandler(async (req, res) => {
  await adminDeleteStudentQuestion(req.params.id);
  sendSuccess(res, { message: 'Question deleted' });
});
