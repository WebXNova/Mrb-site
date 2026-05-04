import { asyncHandler } from '../utils/asyncHandler.js';
import {
  adminDeleteStudentQuestion,
  adminUpdateStudentQuestionAnswer,
  listAdminStudentQuestions,
} from '../services/studentQuestions.service.js';

export const getAdminStudentQuestions = asyncHandler(async (req, res) => {
  const subject = req.query.subject || 'all';
  const data = await listAdminStudentQuestions(subject);
  res.json({ success: true, data });
});

export const putAdminStudentQuestionAnswer = asyncHandler(async (req, res) => {
  const updated = await adminUpdateStudentQuestionAnswer(req.user.id, req.params.id, req.body || {});
  res.json({ success: true, data: updated });
});

export const deleteAdminStudentQuestion = asyncHandler(async (req, res) => {
  await adminDeleteStudentQuestion(req.params.id);
  res.json({ success: true, message: 'Question deleted' });
});
