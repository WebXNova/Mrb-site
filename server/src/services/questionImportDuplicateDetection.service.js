import {
  buildMcqImportFingerprint,
  buildMcqStemFingerprint,
  buildFingerprintsFromReadyItem,
} from './questionImportFingerprint.service.js';

export const IMPORT_DUPLICATE_POLICIES = Object.freeze({
  SKIP: 'skip',
  WARN: 'warn',
  ALLOW: 'allow',
});

export const IMPORT_DUPLICATE_KINDS = Object.freeze({
  EXACT_BANK: 'DUPLICATE_EXACT_BANK',
  EXACT_IN_FILE: 'DUPLICATE_EXACT_IN_FILE',
  NEAR_BANK: 'DUPLICATE_NEAR_BANK',
  NEAR_IN_FILE: 'DUPLICATE_NEAR_IN_FILE',
});

const DUPLICATE_LAYER = 'duplicate_detection';

/**
 * @param {unknown} raw
 */
export function normalizeDuplicatePolicy(raw) {
  const value = String(raw ?? process.env.IMPORT_DUPLICATE_POLICY ?? IMPORT_DUPLICATE_POLICIES.SKIP)
    .trim()
    .toLowerCase();

  if (value === IMPORT_DUPLICATE_POLICIES.WARN) {
    return IMPORT_DUPLICATE_POLICIES.WARN;
  }
  if (value === IMPORT_DUPLICATE_POLICIES.ALLOW) {
    return IMPORT_DUPLICATE_POLICIES.ALLOW;
  }
  return IMPORT_DUPLICATE_POLICIES.SKIP;
}

export class CourseQuestionDuplicateIndex {
  constructor() {
    /** @type {Map<string, { questionId: number }>} */
    this.exactByFingerprint = new Map();
    /** @type {Map<string, Array<{ questionId: number, exactFingerprint: string }>>} */
    this.stemByFingerprint = new Map();
  }

  /**
   * @param {number} questionId
   * @param {string} exactFingerprint
   * @param {string} stemFingerprint
   */
  add(questionId, exactFingerprint, stemFingerprint) {
    this.exactByFingerprint.set(exactFingerprint, { questionId });

    const stemEntries = this.stemByFingerprint.get(stemFingerprint) ?? [];
    if (!stemEntries.some((entry) => entry.questionId === questionId)) {
      stemEntries.push({ questionId, exactFingerprint });
      this.stemByFingerprint.set(stemFingerprint, stemEntries);
    }
  }

  /**
   * @param {string} exactFingerprint
   */
  lookupExact(exactFingerprint) {
    return this.exactByFingerprint.get(exactFingerprint) ?? null;
  }

  /**
   * @param {string} stemFingerprint
   * @param {string} exactFingerprint
   */
  lookupNear(stemFingerprint, exactFingerprint) {
    const stemEntries = this.stemByFingerprint.get(stemFingerprint) ?? [];
    return (
      stemEntries.find((entry) => entry.exactFingerprint !== exactFingerprint) ?? null
    );
  }

  get size() {
    return this.exactByFingerprint.size;
  }
}

export class ImportBatchDuplicateTracker {
  constructor() {
    /** @type {Map<string, { questionNumber: number }>} */
    this.exactInFile = new Map();
    /** @type {Map<string, Array<{ questionNumber: number, exactFingerprint: string }>>} */
    this.stemInFile = new Map();
  }

  /**
   * @param {number} questionNumber
   * @param {string} exactFingerprint
   * @param {string} stemFingerprint
   */
  record(questionNumber, exactFingerprint, stemFingerprint) {
    this.exactInFile.set(exactFingerprint, { questionNumber });

    const stemEntries = this.stemInFile.get(stemFingerprint) ?? [];
    if (!stemEntries.some((entry) => entry.questionNumber === questionNumber)) {
      stemEntries.push({ questionNumber, exactFingerprint });
      this.stemInFile.set(stemFingerprint, stemEntries);
    }
  }

  /**
   * @param {string} exactFingerprint
   */
  lookupExactInFile(exactFingerprint) {
    return this.exactInFile.get(exactFingerprint) ?? null;
  }

  /**
   * @param {string} stemFingerprint
   * @param {string} exactFingerprint
   */
  lookupNearInFile(stemFingerprint, exactFingerprint) {
    const stemEntries = this.stemInFile.get(stemFingerprint) ?? [];
    return (
      stemEntries.find((entry) => entry.exactFingerprint !== exactFingerprint) ?? null
    );
  }
}

/**
 * Load active MCQ fingerprints for a course in a single query (import-time index).
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} courseId
 */
export async function loadCourseQuestionDuplicateIndex(pool, courseId) {
  const [rows] = await pool.query(
    `SELECT
       qb.id AS question_id,
       qb.question_text,
       qo.option_key,
       qo.option_text,
       qo.is_correct
     FROM question_bank qb
     INNER JOIN question_options qo ON qo.question_id = qb.id
     WHERE qb.course_id = ?
       AND qb.deleted_at IS NULL
       AND qb.question_type = 'mcq'
     ORDER BY qb.id ASC, qo.sort_order ASC, qo.id ASC`,
    [courseId]
  );

  /** @type {Map<number, { questionId: number, question_text: string, options: Array<Record<string, unknown>> }>} */
  const grouped = new Map();

  for (const row of rows) {
    const questionId = Number(row.question_id);
    if (!grouped.has(questionId)) {
      grouped.set(questionId, {
        questionId,
        question_text: row.question_text,
        options: [],
      });
    }
    grouped.get(questionId).options.push({
      option_key: row.option_key,
      option_text: row.option_text,
      is_correct: row.is_correct === 1 || row.is_correct === true,
    });
  }

  const index = new CourseQuestionDuplicateIndex();
  for (const question of grouped.values()) {
    const correctKey =
      question.options.find((option) => option.is_correct)?.option_key ?? 'A';
    const exactFingerprint = buildMcqImportFingerprint({
      questionText: question.question_text,
      options: question.options,
      correctAnswerKey: correctKey,
    });
    const stemFingerprint = buildMcqStemFingerprint({
      questionText: question.question_text,
      options: question.options,
      correctAnswerKey: correctKey,
    });
    index.add(question.questionId, exactFingerprint, stemFingerprint);
  }

  return index;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} courseId
 */
export async function loadCourseQuestionDuplicateIndexSafe(pool, courseId) {
  try {
    const index = await Promise.race([
      loadCourseQuestionDuplicateIndex(pool, courseId),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('duplicate_index_timeout')), 2000);
      }),
    ]);
    return index;
  } catch {
    return new CourseQuestionDuplicateIndex();
  }
}

/**
 * @param {{
 *   kind: string,
 *   questionNumber?: number,
 *   existingQuestionId?: number,
 * }} match
 */
export function duplicateDetectionMessage(match) {
  switch (match.kind) {
    case IMPORT_DUPLICATE_KINDS.EXACT_BANK:
      return `Exact duplicate of existing question #${match.existingQuestionId}.`;
    case IMPORT_DUPLICATE_KINDS.EXACT_IN_FILE:
      return `Exact duplicate of question ${match.questionNumber} in this file.`;
    case IMPORT_DUPLICATE_KINDS.NEAR_BANK:
      return `Near duplicate of existing question #${match.existingQuestionId} (same stem and correct answer).`;
    case IMPORT_DUPLICATE_KINDS.NEAR_IN_FILE:
      return `Near duplicate of question ${match.questionNumber} in this file (same stem and correct answer).`;
    default:
      return 'Duplicate question detected.';
  }
}

/**
 * @param {{
 *   policy: string,
 *   exactFingerprint: string,
 *   stemFingerprint: string,
 *   courseIndex: CourseQuestionDuplicateIndex,
 *   batchTracker: ImportBatchDuplicateTracker,
 * }} input
 * @returns {{
 *   kind: string,
 *   errorCode: string,
 *   message: string,
 *   validationLayer: string,
 *   existingQuestionId: number | null,
 *   duplicateQuestionNumber: number | null,
 * } | null}
 */
export function detectImportDuplicate({
  policy,
  exactFingerprint,
  stemFingerprint,
  courseIndex,
  batchTracker,
}) {
  if (policy === IMPORT_DUPLICATE_POLICIES.ALLOW) {
    return null;
  }

  const inFileExact = batchTracker.lookupExactInFile(exactFingerprint);
  if (inFileExact) {
    return {
      kind: IMPORT_DUPLICATE_KINDS.EXACT_IN_FILE,
      errorCode: IMPORT_DUPLICATE_KINDS.EXACT_IN_FILE,
      message: duplicateDetectionMessage({
        kind: IMPORT_DUPLICATE_KINDS.EXACT_IN_FILE,
        questionNumber: inFileExact.questionNumber,
      }),
      validationLayer: DUPLICATE_LAYER,
      existingQuestionId: null,
      duplicateQuestionNumber: inFileExact.questionNumber,
    };
  }

  const bankExact = courseIndex.lookupExact(exactFingerprint);
  if (bankExact) {
    return {
      kind: IMPORT_DUPLICATE_KINDS.EXACT_BANK,
      errorCode: IMPORT_DUPLICATE_KINDS.EXACT_BANK,
      message: duplicateDetectionMessage({
        kind: IMPORT_DUPLICATE_KINDS.EXACT_BANK,
        existingQuestionId: bankExact.questionId,
      }),
      validationLayer: DUPLICATE_LAYER,
      existingQuestionId: bankExact.questionId,
      duplicateQuestionNumber: null,
    };
  }

  const inFileNear = batchTracker.lookupNearInFile(stemFingerprint, exactFingerprint);
  if (inFileNear) {
    return {
      kind: IMPORT_DUPLICATE_KINDS.NEAR_IN_FILE,
      errorCode: IMPORT_DUPLICATE_KINDS.NEAR_IN_FILE,
      message: duplicateDetectionMessage({
        kind: IMPORT_DUPLICATE_KINDS.NEAR_IN_FILE,
        questionNumber: inFileNear.questionNumber,
      }),
      validationLayer: DUPLICATE_LAYER,
      existingQuestionId: null,
      duplicateQuestionNumber: inFileNear.questionNumber,
    };
  }

  const bankNear = courseIndex.lookupNear(stemFingerprint, exactFingerprint);
  if (bankNear) {
    return {
      kind: IMPORT_DUPLICATE_KINDS.NEAR_BANK,
      errorCode: IMPORT_DUPLICATE_KINDS.NEAR_BANK,
      message: duplicateDetectionMessage({
        kind: IMPORT_DUPLICATE_KINDS.NEAR_BANK,
        existingQuestionId: bankNear.questionId,
      }),
      validationLayer: DUPLICATE_LAYER,
      existingQuestionId: bankNear.questionId,
      duplicateQuestionNumber: null,
    };
  }

  return null;
}

export { DUPLICATE_LAYER as IMPORT_DUPLICATE_VALIDATION_LAYER };

/**
 * Dry-run duplicate summary for preview (no DB writes).
 *
 * @param {{
 *   readyItems: Array<{ questionNumber: number, aikenQuestion: { question_text: string, correctAnswer: string }, writePayload: { question_text: string, options: Array<Record<string, unknown>> } }>,
 *   courseIndex: CourseQuestionDuplicateIndex,
 *   policy: string,
 * }} input
 */
export function summarizeReadyItemDuplicates({ readyItems, courseIndex, policy }) {
  const batchTracker = new ImportBatchDuplicateTracker();
  /** @type {Array<{ questionNumber: number, questionTitle: string, errorCode: string, message: string, validationLayer: string }>} */
  const skipped = [];
  /** @type {typeof skipped} */
  const warnings = [];

  if (policy === IMPORT_DUPLICATE_POLICIES.ALLOW) {
    return { skippedDuplicates: 0, skipped, warnings };
  }

  for (const item of readyItems) {
    const { exactFingerprint, stemFingerprint } = buildFingerprintsFromReadyItem(item);
    const duplicateMatch = detectImportDuplicate({
      policy,
      exactFingerprint,
      stemFingerprint,
      courseIndex,
      batchTracker,
    });

    if (!duplicateMatch) {
      batchTracker.record(item.questionNumber, exactFingerprint, stemFingerprint);
      continue;
    }

    const entry = {
      questionNumber: item.questionNumber,
      questionTitle: item.aikenQuestion.question_text,
      errorCode: duplicateMatch.errorCode,
      message: duplicateMatch.message,
      validationLayer: duplicateMatch.validationLayer,
    };

    if (policy === IMPORT_DUPLICATE_POLICIES.SKIP) {
      skipped.push(entry);
      continue;
    }

    warnings.push(entry);
    batchTracker.record(item.questionNumber, exactFingerprint, stemFingerprint);
  }

  return {
    skippedDuplicates: skipped.length,
    skipped,
    warnings,
  };
}
