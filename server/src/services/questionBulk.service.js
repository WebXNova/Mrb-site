import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { toQuestionBankDto } from '../dto/question.dto.js';
import { formatQuestionsAsAikenExport } from './aikenExport.service.js';
import { findActiveQuestionIds } from './questionBankRead.service.js';
import { deleteQuestion, getQuestionById } from './questions.service.js';
import { getTestQuizDraft, upsertTestQuizDraft } from './testQuizDraft.service.js';
import { MAX_QUESTIONS_PER_TEST } from '../validators/testQuestionLimits.schema.js';
import { QUIZ_DRAFT_SCHEMA_VERSION } from '../validators/testQuizDraft.schema.js';
import { extractVisibleTextFromHtml } from '../utils/semanticHtmlContent.js';
import { PHASE_1_QUESTION_TYPE } from '../validators/questionWrite.schema.js';

const LOG_PREFIX = '[question-bank:bulk]';

/**
 * @param {number[]} questionIds
 */
function normalizeQuestionIds(questionIds) {
  return [...new Set(questionIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

/**
 * @param {Awaited<ReturnType<typeof getQuestionById>>} bankQuestion
 */
function bankQuestionToDraftQuestion(bankQuestion) {
  const options = Array.isArray(bankQuestion.options) ? bankQuestion.options : [];
  if (options.length < 2) {
    throw new ApiError(422, 'Question must have at least two options to assign to a test.', {
      code: 'INVALID_QUESTION_OPTIONS',
      question_id: bankQuestion.question_id,
    });
  }

  const visibleTitle = extractVisibleTextFromHtml(bankQuestion.question_text);
  const title =
    visibleTitle.length > 120 ? `${visibleTitle.slice(0, 117)}…` : visibleTitle || `Question ${bankQuestion.question_id}`;

  const points = Number(bankQuestion.marks);
  const normalizedPoints = Number.isFinite(points) && points >= 0.5 ? points : 1;

  return {
    id: `bank-${bankQuestion.question_id}`,
    title,
    questionText: bankQuestion.question_text,
    questionImageUrl: bankQuestion.question_image_url ?? null,
    points: normalizedPoints,
    questionType: 'multiple_choice',
    collapsed: true,
    showExplanation: Boolean(bankQuestion.explanation),
    explanation: bankQuestion.explanation || '',
    choices: options.slice(0, 4).map((option, index) => ({
      id: `bank-${bankQuestion.question_id}-c-${option.id ?? index}`,
      text: option.option_text,
      isCorrect: Boolean(option.is_correct),
      imageUrl: option.image_url ?? null,
    })),
  };
}

/**
 * @param {Array<{ points?: number }>} questions
 */
function sumDraftPoints(questions) {
  return questions.reduce((total, question) => total + Number(question.points || 0), 0);
}

/**
 * @param {number[]} questionIds
 * @param {number} adminId
 * @param {string} adminRole
 */
export async function bulkDeleteQuestions(questionIds, adminId, adminRole = 'admin') {
  const ids = normalizeQuestionIds(questionIds);
  const activeIds = await findActiveQuestionIds(ids);

  const deleted = [];
  const failed = [];

  for (const id of ids) {
    if (!activeIds.includes(id)) {
      failed.push({ question_id: id, reason: 'not_found' });
      continue;
    }

    try {
      const result = await deleteQuestion(id, adminId, adminRole);
      deleted.push(result.question_id);
    } catch (error) {
      failed.push({
        question_id: id,
        reason: error instanceof ApiError ? error.message : 'delete_failed',
        code: error?.code || error?.errorCode || null,
      });
    }
  }

  console.info(`${LOG_PREFIX} bulk delete completed`, {
    requested: ids.length,
    deleted: deleted.length,
    failed: failed.length,
  });

  return { deleted, failed, deleted_count: deleted.length, failed_count: failed.length };
}

/**
 * @param {number[]} questionIds
 */
export async function bulkExportQuestions(questionIds) {
  const ids = normalizeQuestionIds(questionIds);
  const activeIds = await findActiveQuestionIds(ids);
  const missing = ids.filter((id) => !activeIds.includes(id));

  if (!activeIds.length) {
    throw new ApiError(404, 'No active questions found for export.', { code: 'QUESTIONS_NOT_FOUND' });
  }

  const questions = [];
  for (const id of activeIds) {
    const question = await getQuestionById(id);
    questions.push(question);
  }

  const content = formatQuestionsAsAikenExport(questions);
  const timestamp = new Date().toISOString().slice(0, 10);

  console.info(`${LOG_PREFIX} bulk export completed`, {
    exported: questions.length,
    missing: missing.length,
  });

  return {
    format: 'aiken',
    content,
    file_name: `question-bank-export-${timestamp}.aiken`,
    exported_count: questions.length,
    missing_ids: missing,
  };
}

/**
 * @param {number[]} questionIds
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 */
export async function bulkAssignQuestionsToTest(questionIds, testId, userId, role) {
  const ids = normalizeQuestionIds(questionIds);
  const activeIds = await findActiveQuestionIds(ids);
  const missing = ids.filter((id) => !activeIds.includes(id));

  if (!activeIds.length) {
    throw new ApiError(404, 'No active questions found to assign.', { code: 'QUESTIONS_NOT_FOUND' });
  }

  const draftQuestions = [];
  const skipped = [];

  for (const id of activeIds) {
    const question = await getQuestionById(id);
    if (question.question_type !== PHASE_1_QUESTION_TYPE) {
      skipped.push({ question_id: id, reason: 'unsupported_question_type' });
      continue;
    }
    try {
      draftQuestions.push(bankQuestionToDraftQuestion(question));
    } catch (error) {
      skipped.push({
        question_id: id,
        reason: error instanceof ApiError ? error.message : 'mapping_failed',
      });
    }
  }

  if (!draftQuestions.length) {
    throw new ApiError(422, 'No questions could be converted for the test draft.', {
      code: 'ASSIGN_NOT_POSSIBLE',
      skipped,
      missing_ids: missing,
    });
  }

  const draftState = await getTestQuizDraft(testId, userId, role);
  const existingDraft = draftState?.draft;
  const existingQuestions = Array.isArray(existingDraft?.draftPayload?.questions)
    ? existingDraft.draftPayload.questions
    : [];

  const existingBankIds = new Set(
    existingQuestions
      .map((question) => {
        const match = String(question?.id || '').match(/^bank-(\d+)$/);
        return match ? Number(match[1]) : null;
      })
      .filter((id) => Number.isInteger(id) && id > 0)
  );

  const toAppend = draftQuestions.filter((question) => {
    const match = String(question.id).match(/^bank-(\d+)$/);
    const bankId = match ? Number(match[1]) : null;
    return !bankId || !existingBankIds.has(bankId);
  });

  const alreadyLinked = draftQuestions.length - toAppend.length;
  const mergedQuestions = [...existingQuestions, ...toAppend];

  if (mergedQuestions.length > MAX_QUESTIONS_PER_TEST) {
    throw new ApiError(422, `Test cannot exceed ${MAX_QUESTIONS_PER_TEST} questions.`, {
      code: 'TEST_QUESTION_LIMIT',
      current_count: existingQuestions.length,
      requested_add: toAppend.length,
      limit: MAX_QUESTIONS_PER_TEST,
    });
  }

  const draftPayload = {
    version: QUIZ_DRAFT_SCHEMA_VERSION,
    testId: Number(testId),
    storageKey: String(testId),
    questions: mergedQuestions,
    totalPoints: sumDraftPoints(mergedQuestions),
    savedAt: new Date().toISOString(),
  };

  const saved = await upsertTestQuizDraft(testId, userId, role, {
    expectedVersion: existingDraft?.version ?? null,
    draftPayload,
  });

  console.info(`${LOG_PREFIX} bulk assign completed`, {
    test_id: testId,
    assigned: toAppend.length,
    already_linked: alreadyLinked,
    skipped: skipped.length,
    missing: missing.length,
  });

  return {
    test_id: testId,
    assigned_count: toAppend.length,
    already_linked_count: alreadyLinked,
    skipped,
    missing_ids: missing,
    draft_version: saved?.draft?.version ?? null,
    total_questions: mergedQuestions.length,
  };
}

/**
 * @param {number[]} questionIds
 */
export async function fetchQuestionsWithOptionsByIds(questionIds) {
  const ids = normalizeQuestionIds(questionIds);
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(',');
  const [questionRows] = await mysqlPool.query(
    `SELECT id, course_id, subject_id, topic, difficulty, question_type, question_text,
            question_image_url, explanation, marks, created_by, created_at, updated_at
     FROM question_bank
     WHERE id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY id DESC`,
    ids
  );

  if (!questionRows.length) return [];

  const [optionRows] = await mysqlPool.query(
    `SELECT id, question_id, option_key, option_text, image_url, is_correct, sort_order, created_at, updated_at
     FROM question_options
     WHERE question_id IN (${placeholders})
     ORDER BY question_id ASC, sort_order ASC, id ASC`,
    ids
  );

  const optionsByQuestion = new Map();
  for (const row of optionRows) {
    const qid = Number(row.question_id);
    if (!optionsByQuestion.has(qid)) optionsByQuestion.set(qid, []);
    optionsByQuestion.get(qid).push(row);
  }

  return questionRows.map((row) => toQuestionBankDto(row, optionsByQuestion.get(Number(row.id)) || []));
}
