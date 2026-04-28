import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  createTest,
  createTestQuestion,
  deleteTest,
  deleteTestQuestion,
  getTestById,
  listTestQuestions,
  listTests,
  publishTest,
  updateTest,
  updateTestQuestion,
} from '../services/test.service.js';

const testSchema = z.object({
  title: z.string().min(3).max(220),
  description: z.string().max(5000).optional().nullable(),
  subject: z.string().min(2).max(80),
  durationMinutes: z.number().int().min(1).max(600),
  passingMarks: z.number().int().min(0).optional().nullable(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  showExplanations: z.boolean().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

const questionSchema = z.object({
  questionText: z.string().min(3),
  options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
  correctOption: z.string().min(1),
  explanation: z.string().min(1),
  marks: z.number().int().min(1).max(100).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export const getTests = asyncHandler(async (req, res) => {
  const tests = await listTests();
  res.json({ success: true, data: tests });
});

export const postTest = asyncHandler(async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid test payload', parsed.error.flatten());
  const created = await createTest(parsed.data, req.user?.id || null);
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.create',
    entityType: 'test',
    entityId: String(created.id),
  });
  res.status(201).json({ success: true, data: created });
});

export const putTest = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid test payload', parsed.error.flatten());
  const updated = await updateTest(testId, parsed.data);
  if (!updated) throw new ApiError(404, 'Test not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.update',
    entityType: 'test',
    entityId: String(testId),
  });
  res.json({ success: true, data: updated });
});

export const removeTest = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const removed = await deleteTest(testId);
  if (!removed) throw new ApiError(404, 'Test not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.delete',
    entityType: 'test',
    entityId: String(testId),
  });
  res.json({ success: true, message: 'Test deleted' });
});

export const putTestPublish = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const updated = await publishTest(testId);
  if (!updated) throw new ApiError(404, 'Test not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.publish',
    entityType: 'test',
    entityId: String(testId),
  });
  res.json({ success: true, data: updated });
});

export const getTestQuestions = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const test = await getTestById(testId);
  if (!test) throw new ApiError(404, 'Test not found');
  const questions = await listTestQuestions(testId);
  res.json({ success: true, data: questions });
});

export const postTestQuestion = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid question payload', parsed.error.flatten());
  const optionIds = parsed.data.options.map((o) => o.id);
  if (!optionIds.includes(parsed.data.correctOption)) {
    throw new ApiError(422, 'correctOption must match one of the option ids');
  }
  const created = await createTestQuestion(testId, parsed.data);
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.question.create',
    entityType: 'test_question',
    entityId: String(created.id),
    metadata: { testId },
  });
  res.status(201).json({ success: true, data: created });
});

export const putTestQuestion = asyncHandler(async (req, res) => {
  const questionId = Number(req.params.questionId);
  if (!questionId) throw new ApiError(400, 'Invalid question id');
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid question payload', parsed.error.flatten());
  const optionIds = parsed.data.options.map((o) => o.id);
  if (!optionIds.includes(parsed.data.correctOption)) {
    throw new ApiError(422, 'correctOption must match one of the option ids');
  }
  const updated = await updateTestQuestion(questionId, parsed.data);
  if (!updated) throw new ApiError(404, 'Question not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.question.update',
    entityType: 'test_question',
    entityId: String(questionId),
  });
  res.json({ success: true, data: updated });
});

export const removeTestQuestion = asyncHandler(async (req, res) => {
  const questionId = Number(req.params.questionId);
  if (!questionId) throw new ApiError(400, 'Invalid question id');
  const removed = await deleteTestQuestion(questionId);
  if (!removed) throw new ApiError(404, 'Question not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.question.delete',
    entityType: 'test_question',
    entityId: String(questionId),
  });
  res.json({ success: true, message: 'Question deleted' });
});
