import { z } from 'zod';
import multer from 'multer';
import mammoth from 'mammoth';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  bulkInsertImportedQuestions,
  createTest,
  duplicateTest,
  createTestQuestion,
  deleteTest,
  deleteTestQuestion,
  getTestById,
  listTestQuestions,
  listTests,
  parseAikenPayload,
  publishTest,
  parseSpreadsheetRows,
  parseWordRows,
  exportTestResultsWorkbook,
  updateTest,
  updateTestQuestion,
} from '../services/test.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

const testSchema = z.object({
  title: z.string().min(3).max(220),
  description: z.string().max(5000).optional().nullable(),
  subject: z.string().min(2).max(80),
  category: z.string().max(80).optional().nullable(),
  subCategory: z.string().max(80).optional().nullable(),
  durationMinutes: z.number().int().min(1).max(600),
  passingMarks: z.number().int().min(0).optional().nullable(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  negativeMarking: z.number().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  showExplanations: z.boolean().optional(),
  accessMode: z.enum(['private', 'public']).optional(),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  courseId: z.number().int().positive().optional().nullable(),
});

const questionSchema = z.object({
  questionText: z.string().min(3),
  questionImageUrl: z.string().url().optional().nullable(),
  options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
  correctOption: z.string().min(1),
  explanation: z.string().min(1),
  explanationImageUrl: z.string().url().optional().nullable(),
  marks: z.number().int().min(1).max(100).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const previewUploadSchema = z.object({
  content: z.string().min(1),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const importFileUpload = upload.single('file');

const confirmUploadSchema = z.object({
  items: z.array(
    z.object({
      sourceOrder: z.number().int().min(1),
      questionText: z.string().min(1),
      questionImageUrl: z.string().url().optional().nullable(),
      options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })),
      correctOption: z.string().min(1),
      explanation: z.string().optional().nullable(),
      explanationImageUrl: z.string().url().optional().nullable(),
      marks: z.number().int().min(1).max(100).optional(),
      orderIndex: z.number().int().min(0).optional(),
    })
  ),
});

export const getTests = asyncHandler(async (req, res) => {
  const tests = await listTests();
  sendSuccess(res, tests);
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
  sendSuccess(res, created, 201);
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
  sendSuccess(res, updated);
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
  sendSuccess(res, { message: 'Test deleted' });
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
  sendSuccess(res, updated);
});

export const postDuplicateTest = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const copied = await duplicateTest(testId, req.user?.id || null);
  if (!copied) throw new ApiError(404, 'Test not found');
  sendSuccess(res, copied, 201);
});

export const getTestQuestions = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const test = await getTestById(testId);
  if (!test) throw new ApiError(404, 'Test not found');
  const questions = await listTestQuestions(testId);
  sendSuccess(res, questions);
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
  sendSuccess(res, created, 201);
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
  sendSuccess(res, updated);
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
  sendSuccess(res, { message: 'Question deleted' });
});

export const postTestQuestionsImportPreview = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const test = await getTestById(testId);
  if (!test) throw new ApiError(404, 'Test not found');

  const parsed = previewUploadSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid preview payload', parsed.error.flatten());

  const preview = parseAikenPayload(parsed.data.content);
  sendSuccess(res, preview);
});

export const postTestQuestionsImportPreviewFile = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const test = await getTestById(testId);
  if (!test) throw new ApiError(404, 'Test not found');
  if (!req.file) throw new ApiError(400, 'No file uploaded');

  const fileName = String(req.file.originalname || '').toLowerCase();
  let preview;

  if (fileName.endsWith('.txt')) {
    preview = parseAikenPayload(req.file.buffer.toString('utf8'));
  } else if (fileName.endsWith('.xlsx')) {
    const rows = parseSpreadsheetRows(req.file.buffer);
    const content = rows
      .map((row) => {
        const options = (row.options || []).filter((option) => String(option.text || '').trim());
        const aikenOptions = options.map((option) => `${option.id}. ${option.text}`).join('\n');
        return `${row.questionText}\n${aikenOptions}\nANSWER: ${row.correctOption}`;
      })
      .join('\n\n');
    preview = parseAikenPayload(content);
    preview.items = preview.items.map((item, idx) => ({
      ...item,
      explanation: String(rows[idx]?.explanation || '').trim(),
    }));
  } else if (fileName.endsWith('.docx')) {
    const extracted = await mammoth.extractRawText({ buffer: req.file.buffer });
    const rows = parseWordRows(extracted.value || '');
    const content = rows
      .map((row) => {
        const options = (row.options || []).filter((option) => String(option.text || '').trim());
        const aikenOptions = options.map((option) => `${option.id}. ${option.text}`).join('\n');
        return `${row.questionText}\n${aikenOptions}\nANSWER: ${row.correctOption}`;
      })
      .join('\n\n');
    preview = parseAikenPayload(content);
    preview.items = preview.items.map((item, idx) => ({
      ...item,
      explanation: String(rows[idx]?.explanation || '').trim(),
    }));
  } else {
    throw new ApiError(422, 'Unsupported file format. Use .txt, .xlsx or .docx');
  }

  sendSuccess(res, preview);
});

export const postTestQuestionsImportConfirm = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const test = await getTestById(testId);
  if (!test) throw new ApiError(404, 'Test not found');

  const parsed = confirmUploadSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid import confirm payload', parsed.error.flatten());

  if (!parsed.data.items.length) throw new ApiError(422, 'No rows provided for import');

  const previewValidation = parsed.data.items.map((item, index) => {
    const optionIds = item.options.map((option) => option.id);
    const errors = [];
    if (item.options.length < 2) errors.push('At least 2 options are required');
    if (!optionIds.includes(item.correctOption)) {
      errors.push('correctOption must match one provided option id');
    }
    return { index, errors };
  });
  const hasInvalid = previewValidation.some((row) => row.errors.length);
  if (hasInvalid) {
    throw new ApiError(
      422,
      'Invalid rows present in import payload',
      previewValidation.filter((row) => row.errors.length)
    );
  }

  const inserted = await bulkInsertImportedQuestions(testId, parsed.data.items);
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.question.import',
    entityType: 'test_question',
    entityId: String(testId),
    metadata: {
      testId,
      importedCount: inserted.length,
    },
  });

  sendSuccess(
    res,
    {
      insertedCount: inserted.length,
      questions: inserted,
    },
    201
  );
});

export const getTestResultsExport = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const exported = await exportTestResultsWorkbook(testId);
  if (!exported) throw new ApiError(404, 'Test not found');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
  res.send(exported.buffer);
});

