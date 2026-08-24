/**
 * Test completeness engine — single source of truth for wizard + publish gates.
 */

import { AppError } from '../errors/base/AppError.js';
import { VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import { mysqlPool } from '../config/mysql.js';
import { loadTestSubjectIds } from './testSubjectValidation.service.js';
import { resolveTestQuestionAuthority } from './testQuestionAuthority.service.js';
import { findTestQuizDraftByTestIdForRead } from '../repositories/testQuizDraft.repository.js';
import {
  collectEmptySectionWarnings,
  collectInvalidSectionLabels,
} from './quizDraftSectionValidation.service.js';

export const TEST_LIFECYCLE_STATES = Object.freeze({
  INCOMPLETE: 'INCOMPLETE',
  DRAFT: 'DRAFT',
  READY_FOR_PUBLISH: 'READY_FOR_PUBLISH',
  PUBLISHED: 'PUBLISHED',
});

export const COMPLETENESS_ERROR_CODES = Object.freeze({
  COURSE_REQUIRED: 'COURSE_REQUIRED',
  TITLE_INVALID: 'TITLE_INVALID',
  TEST_TYPE_REQUIRED: 'TEST_TYPE_REQUIRED',
  DURATION_REQUIRED: 'DURATION_REQUIRED',
  MAX_ATTEMPTS_REQUIRED: 'MAX_ATTEMPTS_REQUIRED',
  PASSING_MARKS_REQUIRED: 'PASSING_MARKS_REQUIRED',
  ACCESS_MODE_REQUIRED: 'ACCESS_MODE_REQUIRED',
  CANNOT_PUBLISH_INCOMPLETE_RULES: 'CANNOT_PUBLISH_INCOMPLETE_RULES',
  NO_QUESTIONS_ADDED: 'NO_QUESTIONS_ADDED',
  NO_QUIZ_DRAFT: 'NO_QUIZ_DRAFT',
  TEST_NOT_COMPLETE: 'TEST_NOT_COMPLETE',
});

import { TEST_DB_STATUS_VALUES, TEST_TYPE_VALUES } from '../constants/testMetadata.constants.js';
import { parseStrictTestDbStatus } from '../validators/testEnumGuards.js';

export { TEST_DB_STATUS_VALUES };

const STEP1_TYPES = new Set(TEST_TYPE_VALUES);

/**
 * @param {string|null|undefined} status
 */
export function isPublishedDbStatus(status) {
  return String(status || '').trim().toLowerCase() === 'published';
}

/**
 * @param {string} lifecycleStatus
 */
export function mapLifecycleStatusToDb(lifecycleStatus) {
  if (lifecycleStatus === TEST_LIFECYCLE_STATES.PUBLISHED) return 'published';
  return lifecycleStatus;
}

/**
 * @param {string} dbOrLifecycleStatus
 */
export function isPublishDbStatusValue(dbOrLifecycleStatus) {
  const normalized = String(dbOrLifecycleStatus || '').trim().toLowerCase();
  return normalized === 'published' || normalized === TEST_LIFECYCLE_STATES.PUBLISHED.toLowerCase();
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {number[]} subjectIds
 * @param {string[]} missingFields
 */
function evaluateStep1(testRow, subjectIds, missingFields) {
  let complete = true;
  const courseId = Number(testRow.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    missingFields.push('course_id');
    complete = false;
  }

  const title = String(testRow.title ?? '').trim();
  if (title.length < 3) {
    missingFields.push('title');
    complete = false;
  }

  const testType = String(testRow.test_type ?? '').trim();
  if (!testType || !STEP1_TYPES.has(testType)) {
    missingFields.push('test_type');
    complete = false;
  }

  const category = String(testRow.category ?? '').trim();
  if (!category) {
    missingFields.push('category');
    complete = false;
  }

  const ids = subjectIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (testType === 'subject_wise') {
    if (ids.length !== 1) {
      missingFields.push('subject_id');
      complete = false;
    }
  } else if (testType === 'mixed_subject' && ids.length < 1) {
    missingFields.push('subject_ids');
    complete = false;
  }

  return complete;
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {string[]} missingFields
 */
function evaluateStep2(testRow, missingFields) {
  let complete = true;
  const duration = Number(testRow.duration_minutes ?? testRow.duration_minutes);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 600) {
    missingFields.push('duration_minutes');
    complete = false;
  }

  const maxAttempts = Number(testRow.max_attempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0 || maxAttempts > 50) {
    missingFields.push('max_attempts');
    complete = false;
  }

  const passingMarks = testRow.passing_marks;
  if (passingMarks == null || !Number.isFinite(Number(passingMarks)) || Number(passingMarks) < 0) {
    missingFields.push('passing_marks');
    complete = false;
  }

  return complete;
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {string[]} missingFields
 */
function evaluateStep3(testRow, missingFields) {
  const accessMode = String(testRow.access_mode ?? '').trim().toLowerCase();
  if (accessMode !== 'public' && accessMode !== 'private') {
    missingFields.push('access_mode');
    return false;
  }
  return true;
}

/**
 * Question count used for wizard step 4 / publish readiness.
 * Unpublished tests publish via quiz-draft materialization — runtime links alone do not count.
 *
 * @param {Record<string, unknown>} testRow
 * @param {Record<string, unknown>} authorityMeta
 */
export function resolveWizardQuestionCount(testRow, authorityMeta = {}) {
  if (isPublishedDbStatus(testRow.status)) {
    return Number(authorityMeta.questionCount ?? 0);
  }
  if (authorityMeta.hasQuizDraft) {
    return Number(authorityMeta.draftQuestionCount ?? 0);
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {Record<string, unknown>} authorityMeta
 * @param {string[]} missingFields
 */
function evaluateStep4(testRow, authorityMeta, missingFields) {
  const hasQuizDraft = Boolean(authorityMeta.hasQuizDraft);
  const wizardQuestionCount = resolveWizardQuestionCount(testRow, authorityMeta);

  if (isPublishedDbStatus(testRow.status)) {
    if (wizardQuestionCount < 1) {
      missingFields.push('questions');
      return false;
    }
    return true;
  }

  if (!hasQuizDraft) {
    missingFields.push('quiz_draft');
    return false;
  }

  if (wizardQuestionCount < 1) {
    missingFields.push('questions');
    return false;
  }

  return true;
}

/**
 * Structured publish checklist — one entry per missing requirement (not first-only).
 * Empty-section warnings are included as non-blocking items.
 *
 * @param {string[]} missingFields
 * @param {{
 *   invalidSections?: Array<{ id?: string, index?: number, sectionNumber?: number, label?: string }>,
 *   emptySectionWarnings?: string[],
 * }} [extras]
 */
export function buildMissingRequirementItems(missingFields = [], extras = {}) {
  const fields = [...new Set((missingFields || []).map((field) => String(field)))];
  const invalidSections = Array.isArray(extras.invalidSections) ? extras.invalidSections : [];
  const emptySectionWarnings = Array.isArray(extras.emptySectionWarnings) ? extras.emptySectionWarnings : [];
  const items = [];

  for (const code of fields) {
    if (code === 'section_labels' && invalidSections.length) {
      invalidSections.forEach((section) => {
        const name = String(section.label || '').trim();
        const number = Number(section.sectionNumber) || Number(section.index) + 1;
        items.push({
          code,
          blocking: true,
          key: `section_labels:${section.id || section.index || number}`,
          message: name
            ? `Section "${name}" is missing a valid subject label`
            : `Section ${number} is missing a valid subject label`,
        });
      });
      continue;
    }
    items.push({ code, blocking: true, key: code });
  }

  emptySectionWarnings.forEach((warning, index) => {
    items.push({
      code: 'empty_section',
      blocking: false,
      key: `empty_section:${index}`,
      message: String(warning),
    });
  });

  return items;
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {number} questionCount
 * @param {'general'|'publish'} [context]
 */
export function evaluateTestCompleteness(
  testRow,
  questionCount = 0,
  context = 'general',
  subjectIds = [],
  authorityMeta = {}
) {
  const missingFields = [];
  const step1_complete = evaluateStep1(testRow, subjectIds, missingFields);
  const step2_complete = evaluateStep2(testRow, missingFields);
  const step3_complete = evaluateStep3(testRow, missingFields);
  const wizardQuestionCount = resolveWizardQuestionCount(testRow, {
    ...authorityMeta,
    questionCount: authorityMeta.questionCount ?? questionCount,
  });
  const step4_complete = evaluateStep4(testRow, authorityMeta, missingFields);

  const uniqueMissing = [...new Set(missingFields)];
  const can_publish = step1_complete && step2_complete && step3_complete && step4_complete;

  let lifecycle_status = TEST_LIFECYCLE_STATES.INCOMPLETE;
  if (isPublishedDbStatus(testRow.status)) {
    lifecycle_status = TEST_LIFECYCLE_STATES.PUBLISHED;
  } else if (step1_complete && step2_complete && step3_complete && step4_complete) {
    lifecycle_status = TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH;
  } else if (step1_complete && step2_complete && step3_complete) {
    lifecycle_status = TEST_LIFECYCLE_STATES.DRAFT;
  } else {
    lifecycle_status = TEST_LIFECYCLE_STATES.INCOMPLETE;
  }

  return {
    step1_complete,
    step2_complete,
    step3_complete,
    step4_complete,
    can_publish,
    missing_fields: uniqueMissing,
    lifecycle_status,
    question_count: wizardQuestionCount,
    question_authority_source: authorityMeta.source ?? null,
    runtime_composed_count: authorityMeta.runtimeComposedCount ?? null,
    draft_question_count: authorityMeta.draftQuestionCount ?? null,
    draft_total_count: authorityMeta.draftTotalCount ?? null,
    has_quiz_draft: authorityMeta.hasQuizDraft ?? false,
    missing_requirement_items: buildMissingRequirementItems(uniqueMissing),
  };
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function loadTestCompletenessRow(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT id, course_id, title, category, test_type, duration_minutes, max_attempts, passing_marks, access_mode, status
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
/** Raw junction row count (includes orphan/deleted links). Not used for publish gates. */
export async function countLinkedQuestionsForTest(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(`SELECT COUNT(*) AS total FROM test_questions WHERE test_id = ?`, [tid]);
  return Number(rows[0]?.total ?? 0);
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function getTestCompletenessReport(testId, executor = mysqlPool) {
  const row = await loadTestCompletenessRow(testId, executor);
  if (!row) return null;
  const authority = await resolveTestQuestionAuthority(testId, executor, { testRow: row });
  const subjectIds = await loadTestSubjectIds(testId, executor);
  const report = evaluateTestCompleteness(row, authority.questionCount, 'general', subjectIds, authority);
  let invalidSections = [];
  let publishWarnings = [];

  if (authority.hasQuizDraft) {
    const draft = await findTestQuizDraftByTestIdForRead(executor, Number(testId));
    if (draft?.draftPayload) {
      invalidSections = collectInvalidSectionLabels(draft.draftPayload);
      publishWarnings = collectEmptySectionWarnings(draft.draftPayload);
      if (invalidSections.length) {
        report.missing_fields = [...new Set([...report.missing_fields, 'section_labels'])];
        report.can_publish = false;
        if (report.step4_complete && report.missing_fields.includes('section_labels')) {
          report.step4_complete = false;
        }
      }
      report.publish_warnings = publishWarnings;
    }
  }

  report.missing_requirement_items = buildMissingRequirementItems(report.missing_fields, {
    invalidSections,
    emptySectionWarnings: publishWarnings,
  });

  return report;
}

/**
 * Recompute lifecycle status from DB truth and persist (never auto-publish).
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function syncTestLifecycleStatus(testId, executor = mysqlPool) {
  const row = await loadTestCompletenessRow(testId, executor);
  if (!row) return null;

  const subjectIds = await loadTestSubjectIds(testId, executor);

  const authority = await resolveTestQuestionAuthority(testId, executor, { testRow: row });

  if (isPublishedDbStatus(row.status)) {
    return evaluateTestCompleteness(row, authority.questionCount, 'general', subjectIds, authority);
  }

  const report = evaluateTestCompleteness(row, authority.questionCount, 'general', subjectIds, authority);
  const dbStatus = parseStrictTestDbStatus(mapLifecycleStatusToDb(report.lifecycle_status));

  await executor.query(`UPDATE tests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [
    dbStatus,
    Number(testId),
  ]);

  return report;
}

