import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  createStudentQuestion,
  getStudentQuestionForUser,
  listStudentQuestions,
} from '../services/studentQuestions.service.js';

export const getStudentQuestions = asyncHandler(async (req, res) => {
  const data = await listStudentQuestions(req.user.id);
  res.json({ success: true, data });
});

export const postStudentQuestion = asyncHandler(async (req, res) => {
  const created = await createStudentQuestion(req.user.id, req.body || {});
  res.status(201).json({ success: true, data: created });
});

export const getStudentQuestionById = asyncHandler(async (req, res) => {
  const row = await getStudentQuestionForUser(req.user.id, req.params.id);
  if (!row) throw new ApiError(404, 'Question not found');
  res.json({ success: true, data: row });
});
