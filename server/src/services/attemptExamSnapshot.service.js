/**
 * Attempt exam snapshot — freeze the paper at attempt start.
 *
 * Live test_questions / question_bank may change after an admin edits a published
 * test. Load, answer validation, and grading must use this snapshot, not the
 * current test definition.
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { StructuredLogger } from '../utils/requestId.js';
import {
  ATTEMPT_EXAM_SNAPSHOT_INVALID,
  ATTEMPT_EXAM_SNAPSHOT_MISSING,
  INVALID_OPTION,
  QUESTION_NOT_IN_TEST,
} from '../errors/codes/ErrorCodes.js';
import { InvalidOptionError, QuestionNotInTestError } from '../errors/testAttempt/TestAttemptErrors.js';
import {
  loadComposedQuestionsWithAttemptLayout,
  isShuffleEnabled,
} from './attemptDeliveryLayout.service.js';
import { loadTestSectionsForStudentAttempt } from './testQuestionComposition.service.js';
import { buildPresentationSettings } from '../utils/testPresentation.js';

const snapshotLogger = new StructuredLogger({ service: 'attemptExamSnapshot' });

export const EXAM_SNAPSHOT_VERSION = 1;

const PERSIST_EXAM_SNAPSHOT_SQL = `
  UPDATE test_attempts
  SET exam_snapshot_json = ?
  WHERE id = ?
    AND exam_snapshot_json IS NULL
`;

const LOAD_EXAM_SNAPSHOT_SQL = `
  SELECT exam_snapshot_json, delivery_layout_json, attempt_nonce, test_id
  FROM test_attempts
  WHERE id = ?
  LIMIT 1
`;

const LOAD_TEST_SNAPSHOT_META_SQL = `
  SELECT id, title, passing_marks, negative_marking, layout_mode, display_mode, full_page_mode,
         shuffle_questions, shuffle_options
  FROM tests
  WHERE id = ?
  LIMIT 1
`;

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function parseExamSnapshot(raw) {
  if (raw == null || raw === '') return null;

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (Number(parsed.version) !== EXAM_SNAPSHOT_VERSION) return null;
  if (!Array.isArray(parsed.questions) || parsed.questions.length < 1) return null;

  return parsed;
}

/**
 * @param {{
 *   testId: number,
 *   testRow: Record<string, unknown>,
 *   sections: Array<Record<string, unknown>>,
 *   composedQuestions: Array<Record<string, unknown>>,
 * }} input
 */
export function buildExamSnapshot({ testId, testRow, sections, composedQuestions }) {
  const questions = (composedQuestions || []).map((question, index) => ({
    questionId: Number(question.questionId),
    questionText: String(question.questionText ?? ''),
    questionImageUrl: question.questionImageUrl ?? null,
    explanation: question.explanation == null ? '' : String(question.explanation),
    tipHtml: question.tipHtml ?? null,
    marks: Number(question.marks ?? question.effectiveMarks ?? 1),
    effectiveMarks: Number(question.effectiveMarks ?? question.marks ?? 1),
    sectionId: question.sectionId == null ? null : Number(question.sectionId),
    displayOrder: Number(question.displayOrder ?? index),
    options: (question.options || []).map((option, optionIndex) => ({
      optionId: Number(option.optionId),
      optionKey: option.optionKey == null ? null : String(option.optionKey),
      optionText: String(option.optionText ?? ''),
      imageUrl: option.imageUrl ?? null,
      isCorrect: Boolean(option.isCorrect),
      sortOrder: Number(option.sortOrder ?? optionIndex),
    })),
  }));

  return {
    version: EXAM_SNAPSHOT_VERSION,
    testId: Number(testId),
    grading: {
      passingMarks: Number(testRow?.passing_marks ?? testRow?.passingMarks ?? 0),
      negativeMarking: Number(testRow?.negative_marking ?? testRow?.negativeMarking ?? 0),
    },
    presentation: {
      title: String(testRow?.title ?? ''),
      ...buildPresentationSettings(testRow),
    },
    sections: (sections || []).map((section) => ({
      id: Number(section.id),
      subjectLabel: String(section.subjectLabel ?? ''),
      dividerContentHtml: section.dividerContentHtml ?? null,
      displayOrder: Number(section.displayOrder ?? 0),
    })),
    questions,
  };
}

/**
 * Student delivery shape — no correctness or explanations.
 * @param {object} snapshot
 */
export function snapshotQuestionsForStudent(snapshot) {
  return (snapshot?.questions || []).map((question) => ({
    questionId: Number(question.questionId),
    questionText: question.questionText,
    questionImageUrl: question.questionImageUrl ?? null,
    sectionId: question.sectionId ?? null,
    tipHtml: question.tipHtml ?? null,
    marks: Number(question.effectiveMarks ?? question.marks ?? 1),
    effectiveMarks: Number(question.effectiveMarks ?? question.marks ?? 1),
    displayOrder: Number(question.displayOrder ?? 0),
    options: (question.options || []).map((option) => ({
      optionId: Number(option.optionId),
      optionKey: option.optionKey ?? null,
      optionText: option.optionText,
      imageUrl: option.imageUrl ?? null,
    })),
  }));
}

/**
 * Grading shape — includes isCorrect and explanations.
 * @param {object} snapshot
 */
export function snapshotQuestionsForGrading(snapshot) {
  return (snapshot?.questions || []).map((question) => ({
    questionId: Number(question.questionId),
    questionText: question.questionText,
    questionImageUrl: question.questionImageUrl ?? null,
    explanation: question.explanation ?? '',
    marks: Number(question.marks ?? question.effectiveMarks ?? 1),
    effectiveMarks: Number(question.effectiveMarks ?? question.marks ?? 1),
    sectionId: question.sectionId ?? null,
    displayOrder: Number(question.displayOrder ?? 0),
    options: (question.options || []).map((option) => ({
      optionId: Number(option.optionId),
      optionKey: option.optionKey ?? null,
      optionText: option.optionText,
      imageUrl: option.imageUrl ?? null,
      isCorrect: Boolean(option.isCorrect),
      sortOrder: Number(option.sortOrder ?? 0),
    })),
  }));
}

/**
 * @param {object} snapshot
 */
export function snapshotSectionsForStudent(snapshot) {
  return Array.isArray(snapshot?.sections) ? snapshot.sections : [];
}

/**
 * @param {object} snapshot
 */
export function snapshotGradingConfig(snapshot) {
  return {
    passingMarks: Number(snapshot?.grading?.passingMarks ?? 0),
    negativeMarking: Number(snapshot?.grading?.negativeMarking ?? 0),
  };
}

/**
 * Shape expected by the legacy grading pipeline (question_id / correct_option_id).
 * @param {object} snapshot
 * @param {Array<{ question_id: unknown, selected_option_id?: unknown }>} answerRows
 */
export function snapshotToGradingQuestionRows(snapshot, answerRows = []) {
  const answersMap = new Map(
    (answerRows || []).map((row) => [
      Number(row.question_id),
      row.selected_option_id == null ? null : Number(row.selected_option_id),
    ])
  );

  return snapshotQuestionsForGrading(snapshot).map((question) => {
    const correct = (question.options || []).find((option) => option.isCorrect);
    const questionId = Number(question.questionId);
    return {
      question_id: questionId,
      effective_marks: Number(question.effectiveMarks ?? question.marks ?? 1),
      selected_option_id: answersMap.has(questionId) ? answersMap.get(questionId) : null,
      correct_option_id: correct ? Number(correct.optionId) : null,
    };
  });
}

/**
 * @param {unknown} raw
 * @returns {Array<Record<string, unknown>>}
 */
export function parseResultDetailItems(raw) {
  if (raw == null || raw === '') return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * @param {object} snapshot
 * @param {unknown} questionId
 */
export function questionBelongsToSnapshot(snapshot, questionId) {
  const qid = Number(questionId);
  if (!Number.isInteger(qid) || qid <= 0 || !snapshot?.questions) return false;
  return snapshot.questions.some((question) => Number(question.questionId) === qid);
}

/**
 * @param {object} snapshot
 * @param {unknown} questionId
 * @param {unknown} optionId
 */
export function optionBelongsToSnapshot(snapshot, questionId, optionId) {
  const qid = Number(questionId);
  const oid = Number(optionId);
  if (!Number.isInteger(qid) || qid <= 0 || !Number.isInteger(oid) || oid <= 0) {
    return false;
  }
  const question = (snapshot?.questions || []).find((row) => Number(row.questionId) === qid);
  if (!question) return false;
  return (question.options || []).some((option) => Number(option.optionId) === oid);
}

/**
 * @param {object} snapshot
 * @param {{ attemptId?: number, questionId: number, optionId?: number }} meta
 */
export function assertAnswerBelongsToExamSnapshot(snapshot, { attemptId, questionId, optionId }) {
  if (!questionBelongsToSnapshot(snapshot, questionId)) {
    throw new QuestionNotInTestError({
      attemptId: attemptId ?? null,
      questionId,
      errorCode: QUESTION_NOT_IN_TEST,
    });
  }
  if (optionId != null && !optionBelongsToSnapshot(snapshot, questionId, optionId)) {
    throw new InvalidOptionError({
      questionId,
      optionId,
      errorCode: INVALID_OPTION,
    });
  }
}

/**
 * Persist snapshot once (null → JSON). Safe under concurrent loaders.
 *
 * @param {{
 *   attemptId: number,
 *   testId: number,
 *   shuffleQuestions?: boolean,
 *   shuffleOptions?: boolean,
 *   attemptNonce?: string|null,
 *   deliveryLayoutJson?: unknown,
 *   testRow?: Record<string, unknown>|null,
 *   connection: import('mysql2/promise').PoolConnection,
 * }} input
 */
export async function persistAttemptExamSnapshot(input) {
  const attemptId = Number(input.attemptId);
  const testId = Number(input.testId);
  const connection = input.connection;

  const composed = await loadComposedQuestionsWithAttemptLayout({
    attemptId,
    testId,
    shuffleQuestions: Boolean(input.shuffleQuestions),
    shuffleOptions: Boolean(input.shuffleOptions),
    deliveryLayoutJson: input.deliveryLayoutJson,
    attemptNonce: input.attemptNonce ?? null,
    audience: 'admin',
    connection,
  });

  if (!Array.isArray(composed) || composed.length < 1) {
    throw new AppError({
      message: 'This test has no questions to freeze for the attempt.',
      errorCode: ATTEMPT_EXAM_SNAPSHOT_MISSING,
      httpStatus: 409,
      isOperational: true,
      metadata: { attemptId, testId },
    });
  }

  const sections = await loadTestSectionsForStudentAttempt(testId, connection);
  const [[meta]] = await connection.query(LOAD_TEST_SNAPSHOT_META_SQL, [testId]);
  const testRow = { ...(input.testRow ?? {}), ...(meta ?? {}) };

  const snapshot = buildExamSnapshot({
    testId,
    testRow,
    sections,
    composedQuestions: composed,
  });

  await connection.query(PERSIST_EXAM_SNAPSHOT_SQL, [JSON.stringify(snapshot), attemptId]);
  return snapshot;
}

/**
 * Return stored snapshot, or capture once from live composition for legacy rows.
 *
 * @param {{
 *   attemptId: number,
 *   testId?: number,
 *   examSnapshotJson?: unknown,
 *   deliveryLayoutJson?: unknown,
 *   attemptNonce?: string|null,
 *   shuffleQuestions?: boolean,
 *   shuffleOptions?: boolean,
 *   testRow?: Record<string, unknown>|null,
 *   connection?: import('mysql2/promise').PoolConnection,
 *   executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection,
 * }} input
 */
export async function resolveAttemptExamSnapshot(input) {
  const attemptId = Number(input.attemptId);
  const executor = input.connection ?? input.executor ?? mysqlPool;

  let examSnapshotJson = input.examSnapshotJson;
  let testId = input.testId != null ? Number(input.testId) : null;
  let deliveryLayoutJson = input.deliveryLayoutJson;
  let attemptNonce = input.attemptNonce ?? null;

  if (examSnapshotJson == null || testId == null) {
    const [[row]] = await executor.query(LOAD_EXAM_SNAPSHOT_SQL, [attemptId]);
    if (!row) {
      throw new AppError({
        message: 'Attempt was not found.',
        errorCode: 'ATTEMPT_NOT_FOUND',
        httpStatus: 404,
        isOperational: true,
        metadata: { attemptId },
      });
    }
    examSnapshotJson = examSnapshotJson ?? row.exam_snapshot_json;
    testId = testId ?? Number(row.test_id);
    deliveryLayoutJson = deliveryLayoutJson ?? row.delivery_layout_json;
    attemptNonce = attemptNonce ?? row.attempt_nonce;
  }

  const existing = parseExamSnapshot(examSnapshotJson);
  if (existing) {
    return existing;
  }

  if (examSnapshotJson != null && examSnapshotJson !== '') {
    throw new AppError({
      message: 'This attempt exam snapshot could not be read.',
        errorCode: ATTEMPT_EXAM_SNAPSHOT_INVALID,
      httpStatus: 500,
      isOperational: true,
      metadata: { attemptId },
    });
  }

  snapshotLogger.warn('legacy attempt missing exam snapshot — freezing current paper once', {
    event: 'EXAM_SNAPSHOT_NULL_BACKFILL',
    attemptId,
    testId,
  });

  if (!input.connection) {
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      const snapshot = await persistAttemptExamSnapshot({
        attemptId,
        testId,
        shuffleQuestions: input.shuffleQuestions,
        shuffleOptions: input.shuffleOptions,
        attemptNonce,
        deliveryLayoutJson,
        testRow: input.testRow,
        connection,
      });
      const [[confirm]] = await connection.query(LOAD_EXAM_SNAPSHOT_SQL, [attemptId]);
      await connection.commit();
      return parseExamSnapshot(confirm?.exam_snapshot_json) ?? snapshot;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  const snapshot = await persistAttemptExamSnapshot({
    attemptId,
    testId,
    shuffleQuestions: input.shuffleQuestions,
    shuffleOptions: input.shuffleOptions,
    attemptNonce,
    deliveryLayoutJson,
    testRow: input.testRow,
    connection: input.connection,
  });
  const [[confirm]] = await input.connection.query(LOAD_EXAM_SNAPSHOT_SQL, [attemptId]);
  return parseExamSnapshot(confirm?.exam_snapshot_json) ?? snapshot;
}

/**
 * @param {Record<string, unknown>|null|undefined} testRow
 */
export function snapshotShuffleFlags(testRow) {
  return {
    shuffleQuestions: isShuffleEnabled(testRow?.shuffle_questions ?? testRow?.shuffleQuestions),
    shuffleOptions: isShuffleEnabled(testRow?.shuffle_options ?? testRow?.shuffleOptions),
  };
}
