import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  createStudentQuestion,
  getStudentQuestionForUser,
  listStudentQuestions,
} from '../services/studentQuestions.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

export const getStudentQuestions = asyncHandler(async (req, res) => {
  const data = await listStudentQuestions(req.user.id);
  sendSuccess(res, data);
});

export const postStudentQuestion = asyncHandler(async (req, res) => {
  const created = await createStudentQuestion(req.user.id, req.body || {});
  sendSuccess(res, created, 201);
});

export const getStudentQuestionById = asyncHandler(async (req, res) => {
  const row = await getStudentQuestionForUser(req.user.id, req.params.id);
  if (!row) throw new ApiError(404, 'Question not found');
  sendSuccess(res, row);
});
