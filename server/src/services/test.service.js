import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import XLSX from 'xlsx';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { loadPublishedTestMetaBySlug } from './testQuestionComposition.service.js';
import { sanitizePlainText } from '../utils/plainTextSanitizer.js';
import { AppError } from '../errors/base/AppError.js';
import { NOT_FOUND, PUBLISH_REQUIREMENTS_NOT_MET, UNAUTHORIZED } from '../errors/codes/ErrorCodes.js';

import {
  getTestCompletenessReport,
  loadTestCompletenessRow,
  syncTestLifecycleStatus,
  TEST_LIFECYCLE_STATES,
} from './testCompleteness.service.js';
import { executePublishTestStatus } from './testLifecycle.service.js';
import { validatePublishEligibility } from './testPublishEligibility.service.js';
import {
  enforceWizardWrite,
  getFullTestValidationReport,
  validateTestStateForCreate,
} from './testValidation.service.js';
import {
  DEFAULT_TEST_CATEGORY,
  loadTestSubjectIds,
  normalizeSubjectIdsFromPayload,
  replaceTestSubjects,
  validateSubjectsForTest,
} from './testSubjectValidation.service.js';
import { parseStrictTestCategory, parseStrictTestType } from '../validators/testEnumGuards.js';
import { LEGACY_ENDPOINT_DISABLED } from './testLifecycle.service.js';
import {
  logTestValidationFailure,
  logSecurityEvent,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';
import {
  loadTestSubjectPresentation,
  loadTestSubjectPresentationBatch,
} from './testSubjectPresentation.service.js';

const REQUIRED_COMPLETENESS_BINDINGS = [
  ['getTestCompletenessReport', getTestCompletenessReport],
  ['loadTestCompletenessRow', loadTestCompletenessRow],
  ['syncTestLifecycleStatus', syncTestLifecycleStatus],
];

for (const [exportName, binding] of REQUIRED_COMPLETENESS_BINDINGS) {
  if (typeof binding !== 'function') {
    throw new Error(`Test completeness service failed to initialize: ${exportName} is not available.`);
  }
}

/** Step 1 creates an incomplete shell — rules must be saved in Step 2. */
const STEP1_DEFAULT_DURATION_MINUTES = 0;
const STEP1_DEFAULT_MAX_ATTEMPTS = 0;
const STEP1_DEFAULT_STATUS = TEST_LIFECYCLE_STATES.INCOMPLETE;

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function buildPublicLink(publicSlug) {
  if (!publicSlug) return null;
  const base = String(env.clientUrl || '').replace(/\/$/, '');
  return `${base}/tests/${publicSlug}`;
}

function toIsoOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const parsed = new Date(typeof value === 'string' || typeof value === 'number' ? value : String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** @param {string|null|undefined} status */
function normalizeSettingsStatusFromDb(status) {
  const normalized = String(status || 'DRAFT').trim().toUpperCase();
  return normalized === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
}

/** @param {'DRAFT'|'PUBLISHED'} status */
function normalizeSettingsStatusToDb(status) {
  return status === 'PUBLISHED' ? 'published' : 'DRAFT';
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 */
async function resolvePublicSlugForTest(testId, executor = mysqlPool) {
  const [rows] = await executor.query(`SELECT id, title, public_slug FROM tests WHERE id = ? LIMIT 1`, [testId]);
  const test = rows[0];
  if (!test) return null;

  if (test.public_slug) return String(test.public_slug);

  const baseSlug = `${slugify(test.title) || 'test'}-${test.id}`;
  let publicSlug = baseSlug;
  let suffix = 1;
  while (true) {
    const [slugRows] = await executor.query(`SELECT id FROM tests WHERE public_slug = ? AND id <> ? LIMIT 1`, [
      publicSlug,
      testId,
    ]);
    if (!slugRows.length) break;
    suffix += 1;
    publicSlug = `${baseSlug}-${suffix}`;
  }
  return publicSlug;
}

function toTest(row, subjectIds = []) {
  let tags = [];
  try {
    tags = JSON.parse(row.tags_json || '[]');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    courseId: row.course_id != null ? Number(row.course_id) : null,
    title: row.title,
    description: row.description,
    category: row.category || DEFAULT_TEST_CATEGORY,
    testType: row.test_type || 'subject_wise',
    subjectIds: Array.isArray(subjectIds) ? subjectIds : [],
    subjectLabel: row.subject_label ?? null,
    durationMinutes: row.duration_minutes,
    passingPercentage: row.passing_percentage != null ? Number(row.passing_percentage) : null,
    passingMarks: row.passing_marks,
    maxAttempts: row.max_attempts,
    negativeMarking: Number(row.negative_marking || 0),
    shuffleQuestions: !!row.shuffle_questions,
    shuffleOptions: !!row.shuffle_options,
    showExplanations: !!row.show_explanations,
    accessMode: row.access_mode || 'private',
    tags,
    status: row.status,
    publicSlug: row.public_slug || null,
    publicLink: buildPublicLink(row.public_slug),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTests() {
  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, description, category, test_type, duration_minutes, passing_percentage,
            passing_marks, max_attempts, negative_marking, shuffle_questions, shuffle_options,
            show_explanations, access_mode, tags_json, status, public_slug, created_at, updated_at
     FROM tests
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`
  );
  const presentationByTestId = await loadTestSubjectPresentationBatch(rows.map((row) => Number(row.id)));
  return rows.map((row) => {
    const tid = Number(row.id);
    const presentation = presentationByTestId.get(tid);
    return toTest(
      {
        ...row,
        subject_label: presentation?.displayLabel ?? null,
      },
      presentation?.subjectIds ?? []
    );
  });
}

export async function getTestById(testId) {
  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, description, category, test_type, duration_minutes, passing_percentage,
            passing_marks, max_attempts, negative_marking, shuffle_questions, shuffle_options,
            show_explanations, access_mode, tags_json, status, public_slug, created_at, updated_at
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [testId]
  );
  if (!rows[0]) return null;
  const presentation = await loadTestSubjectPresentation(testId);
  return toTest({ ...rows[0], subject_label: presentation.displayLabel }, presentation.subjectIds);
}

/**
 * @param {number} testId
 */
async function getActiveTestRowById(testId) {
  const tid = Number(testId);
  if (!Number.isInteger(tid) || tid <= 0) return null;
  const [rows] = await mysqlPool.query(
    `SELECT id, duration_minutes, max_attempts, passing_percentage, passing_marks, negative_marking
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid]
  );
  return rows[0] ?? null;
}

/**
 * Step 2 read model — rules & scoring fields only.
 * @param {number} testId
 */
export async function getTestRulesById(testId) {
  const row = await getActiveTestRowById(testId);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }

  return {
    testId: Number(row.id),
    duration_minutes: Number(row.duration_minutes),
    max_attempts: Number(row.max_attempts),
    passing_percentage: row.passing_percentage == null ? null : Number(row.passing_percentage),
    passing_marks: row.passing_marks == null ? null : Number(row.passing_marks),
    negative_marking: Number(row.negative_marking ?? 0),
  };
}

/**
 * Step 2 — update rules & scoring on an existing test.
 * @param {number} testId
 * @param {{
 *   duration_minutes: number,
 *   max_attempts: number,
 *   passing_percentage?: number,
 *   passing_marks?: number|null,
 *   negative_marking?: number,
 * }} payload
 */
export async function updateTestRules(testId, payload) {
  const tid = Number(testId);
  await enforceWizardWrite(tid, 'rules', mysqlPool, { allowPublishedMaintenance: true });

  const existing = await getActiveTestRowById(tid);
  if (!existing) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid },
    });
  }

  const durationMinutes = Number(payload.duration_minutes);
  const maxAttempts = Number(payload.max_attempts);
  const passingPercentage =
    payload.passing_percentage === undefined
      ? Number(existing.passing_percentage ?? 40)
      : Number(payload.passing_percentage);
  const passingMarks =
    payload.passing_marks === undefined
      ? existing.passing_marks == null
        ? null
        : Number(existing.passing_marks)
      : payload.passing_marks == null
        ? null
        : Number(payload.passing_marks);
  const negativeMarking =
    payload.negative_marking === undefined
      ? Number(existing.negative_marking ?? 0)
      : Number(payload.negative_marking);

  await mysqlPool.query(
    `UPDATE tests
     SET duration_minutes = ?,
         max_attempts = ?,
         passing_percentage = ?,
         passing_marks = ?,
         negative_marking = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [durationMinutes, maxAttempts, passingPercentage, passingMarks, negativeMarking, tid]
  );

  const report = await syncTestLifecycleStatus(tid);

  return {
    testId: tid,
    updated: true,
    lifecycle_status: report?.lifecycle_status ?? TEST_LIFECYCLE_STATES.INCOMPLETE,
  };
}

/**
 * @param {number} testId
 */
async function getActiveTestSettingsRow(testId) {
  const tid = Number(testId);
  if (!Number.isInteger(tid) || tid <= 0) return null;
  const [rows] = await mysqlPool.query(
    `SELECT id, title, shuffle_questions, shuffle_options, show_explanations,
            show_result_immediately, show_answers_after_submit, allow_retake,
            access_mode, status, start_date, end_date, public_slug
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid]
  );
  return rows[0] ?? null;
}

/**
 * Step 3 read model — settings & access fields only.
 * @param {number} testId
 */
export async function getTestSettingsById(testId) {
  const row = await getActiveTestSettingsRow(testId);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }

  const report = await getTestCompletenessReport(Number(testId));

  return {
    testId: Number(row.id),
    shuffle_questions: Boolean(Number(row.shuffle_questions)),
    shuffle_options: Boolean(Number(row.shuffle_options)),
    show_explanations: Boolean(Number(row.show_explanations)),
    show_result_immediately: Boolean(Number(row.show_result_immediately)),
    show_answers_after_submit: Boolean(Number(row.show_answers_after_submit)),
    allow_retake: Boolean(Number(row.allow_retake)),
    access_mode: row.access_mode === 'public' ? 'public' : 'private',
    lifecycle_status: report?.lifecycle_status ?? TEST_LIFECYCLE_STATES.INCOMPLETE,
    start_date: toIsoOrNull(row.start_date),
    end_date: toIsoOrNull(row.end_date),
  };
}

/**
 * Step 3 — update behavioral settings and access control.
 * @param {number} testId
 * @param {Record<string, unknown>} payload
 */
export async function updateTestSettings(testId, payload) {
  const tid = Number(testId);
  await enforceWizardWrite(tid, 'settings', mysqlPool, { allowPublishedMaintenance: true });

  const existing = await getActiveTestSettingsRow(tid);
  if (!existing) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid },
    });
  }

  const startDate = payload.start_date == null ? null : new Date(payload.start_date);
  const endDate = payload.end_date == null ? null : new Date(payload.end_date);

  await mysqlPool.query(
    `UPDATE tests
     SET shuffle_questions = ?,
         shuffle_options = ?,
         show_explanations = ?,
         show_result_immediately = ?,
         show_answers_after_submit = ?,
         allow_retake = ?,
         access_mode = ?,
         start_date = ?,
         end_date = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [
      payload.shuffle_questions ? 1 : 0,
      payload.shuffle_options ? 1 : 0,
      payload.show_explanations ? 1 : 0,
      payload.show_result_immediately ? 1 : 0,
      payload.show_answers_after_submit ? 1 : 0,
      payload.allow_retake ? 1 : 0,
      payload.access_mode,
      startDate,
      endDate,
      tid,
    ]
  );

  const report = await syncTestLifecycleStatus(tid);

  return {
    testId: tid,
    lifecycle_status: report?.lifecycle_status ?? TEST_LIFECYCLE_STATES.INCOMPLETE,
  };
}

export async function getPublishedTestBySlug(publicSlug) {
  return loadPublishedTestMetaBySlug(publicSlug);
}

/**
 * Step 1 — create test container (basic info only). Server applies safe defaults for NOT NULL columns.
 * @param {{
 *   course_id: number,
 *   title: string,
 *   description?: string|null,
 *   category?: string|null,
 *   test_type: 'subject_wise'|'mixed_subject',
 *   subject_id?: number,
 *   subject_ids?: number[],
 * }} payload
 * @param {number|null} createdBy
 */
export async function createTestBasicInfo(payload, createdBy) {
  const creatorId = Number(createdBy);
  if (!Number.isInteger(creatorId) || creatorId <= 0) {
    throw new AppError({
      message: 'Authenticated admin user is required to create a test.',
      errorCode: UNAUTHORIZED,
      httpStatus: 401,
      isOperational: true,
    });
  }

  const courseId = Number(payload.course_id);
  const course = await getCourseRowById(courseId);
  if (!course) {
    throw new AppError({
      message: 'Course was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { courseId },
    });
  }

  const title = sanitizePlainText(payload.title, { maxLength: 120 });
  const description =
    payload.description == null ? null : sanitizePlainText(payload.description, { maxLength: 500 });
  const category = parseStrictTestCategory(payload.category);
  const testType = parseStrictTestType(payload.test_type);

  const normalizedSubjectIds = normalizeSubjectIdsFromPayload(testType, payload);

  validateTestStateForCreate({
    course_id: courseId,
    title,
    category,
    test_type: testType,
    status: STEP1_DEFAULT_STATUS,
  });

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await validateSubjectsForTest(courseId, testType, normalizedSubjectIds, connection);

    const [result] = await connection.query(
      `INSERT INTO tests
         (course_id, title, description, category, test_type, duration_minutes, max_attempts, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        courseId,
        title,
        description,
        category,
        testType,
        STEP1_DEFAULT_DURATION_MINUTES,
        STEP1_DEFAULT_MAX_ATTEMPTS,
        STEP1_DEFAULT_STATUS,
        creatorId,
      ]
    );

    const testId = Number(result.insertId);
    await replaceTestSubjects(testId, normalizedSubjectIds, connection);
    await connection.commit();
    await syncTestLifecycleStatus(testId);

    return {
      testId,
      status: STEP1_DEFAULT_STATUS,
      test_type: testType,
      category,
      subject_ids: normalizedSubjectIds,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Step 1 — update basic info on an existing non-published test.
 * @param {number} testId
 * @param {Parameters<typeof createTestBasicInfo>[0]} payload
 */
export async function updateTestBasicInfo(testId, payload) {
  const tid = Number(testId);
  await enforceWizardWrite(tid, 'basic', mysqlPool, { allowPublishedMaintenance: true });

  const courseId = Number(payload.course_id);
  const course = await getCourseRowById(courseId);
  if (!course) {
    throw new AppError({
      message: 'Course was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { courseId },
    });
  }

  const title = sanitizePlainText(payload.title, { maxLength: 120 });
  const description =
    payload.description == null ? null : sanitizePlainText(payload.description, { maxLength: 500 });
  const category = parseStrictTestCategory(payload.category);
  const testType = parseStrictTestType(payload.test_type);
  const normalizedSubjectIds = normalizeSubjectIdsFromPayload(testType, payload);

  validateTestStateForCreate({
    course_id: courseId,
    title,
    category,
    test_type: testType,
  });

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await validateSubjectsForTest(courseId, testType, normalizedSubjectIds, connection);

    await connection.query(
      `UPDATE tests
       SET course_id = ?,
           title = ?,
           description = ?,
           category = ?,
           test_type = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [courseId, title, description, category, testType, tid]
    );

    await replaceTestSubjects(tid, normalizedSubjectIds, connection);
    await connection.commit();

    const report = await syncTestLifecycleStatus(tid);
    return {
      testId: tid,
      updated: true,
      test_type: testType,
      category,
      subject_ids: normalizedSubjectIds,
      lifecycle_status: report?.lifecycle_status ?? TEST_LIFECYCLE_STATES.INCOMPLETE,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** @deprecated Use createTestBasicInfo via POST /admin/tests only. */
export async function createTest(payload, createdBy = null) {
  logSecurityEvent({
    action: TEST_SECURITY_ACTIONS.LEGACY_ENDPOINT_ACCESS,
    reason: 'createTest_service_deprecated',
    errorCode: LEGACY_ENDPOINT_DISABLED,
    outcome: 'denied',
    metadata: { createdBy },
  });
  throw new AppError({
    message: 'Use POST /admin/tests (wizard Step 1) instead.',
    errorCode: LEGACY_ENDPOINT_DISABLED,
    httpStatus: 410,
    isOperational: true,
  });
}

export async function deleteTest(testId, options = {}) {
  const tid = Number(testId);
  logSecurityEvent({
    action: TEST_SECURITY_ACTIONS.TEST_DELETE,
    testId: tid,
    userId: options.userId ?? null,
    reason: 'test_hard_delete',
    outcome: 'allowed',
  });
  const [result] = await mysqlPool.query(`DELETE FROM tests WHERE id = ?`, [tid]);
  return result.affectedRows > 0;
}

/**
 * @param {number} testId
 * @param {{ userId?: number|null }} [options]
 */
export async function publishTest(testId, options = {}) {
  const tid = Number(testId);

  await validatePublishEligibility(tid, mysqlPool, {
    throwOnFailure: true,
    userId: options.userId,
  });

  const syncReport = await syncTestLifecycleStatus(tid);
  if (!syncReport || syncReport.lifecycle_status !== TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH) {
    logTestValidationFailure({
      testId: tid,
      userId: options.userId ?? null,
      errorCode: PUBLISH_REQUIREMENTS_NOT_MET,
      reason: 'LIFECYCLE_NOT_READY_FOR_PUBLISH',
      action: TEST_SECURITY_ACTIONS.PUBLISH_FAILED,
      metadata: { lifecycle_status: syncReport?.lifecycle_status ?? null },
    });
    throw new AppError({
      message: 'Test lifecycle is not ready for publish.',
      errorCode: PUBLISH_REQUIREMENTS_NOT_MET,
      httpStatus: 400,
      isOperational: true,
      metadata: { testId: tid, lifecycle_status: syncReport?.lifecycle_status ?? null },
    });
  }

  const publicSlug = await resolvePublicSlugForTest(tid);
  await executePublishTestStatus(tid, publicSlug);
  return getTestById(tid);
}

export async function getTestCompleteness(testId) {
  const report = await getFullTestValidationReport(testId);
  if (!report) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }
  return {
    testId: Number(testId),
    ...report,
  };
}

export async function duplicateTest(testId, createdBy = null) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(`SELECT * FROM tests WHERE id = ? LIMIT 1`, [testId]);
    const source = rows[0];
    if (!source) {
      await connection.rollback();
      return null;
    }

    const [insertResult] = await connection.query(
      `INSERT INTO tests
       (course_id, title, description, category, test_type, duration_minutes, passing_marks, max_attempts, negative_marking, shuffle_questions, shuffle_options, show_explanations, access_mode, tags_json, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [
        source.course_id,
        `${source.title} (Copy)`,
        source.description,
        source.category || DEFAULT_TEST_CATEGORY,
        source.test_type || 'mixed_subject',
        source.duration_minutes,
        source.passing_marks,
        source.max_attempts,
        Number(source.negative_marking || 0),
        source.shuffle_questions,
        source.shuffle_options,
        source.show_explanations,
        source.access_mode || 'private',
        source.tags_json || JSON.stringify([]),
        createdBy,
      ]
    );

    const newTestId = Number(insertResult.insertId);

    const [subjectRows] = await connection.query(
      `SELECT subject_id FROM test_subjects WHERE test_id = ?`,
      [testId]
    );
    if (subjectRows.length) {
      const values = subjectRows.map((row) => [newTestId, Number(row.subject_id)]);
      await connection.query(`INSERT INTO test_subjects (test_id, subject_id) VALUES ?`, [values]);
    }

    await connection.query(
      `INSERT INTO test_questions (test_id, question_id, display_order, marks_override)
       SELECT ?, tq.question_id, tq.display_order, tq.marks_override
       FROM test_questions tq
       INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
       WHERE tq.test_id = ?`,
      [newTestId, testId]
    );

    await connection.commit();
    return getTestById(newTestId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function exportTestResultsWorkbook(testId) {
  const [testRows] = await mysqlPool.query(`SELECT id, title FROM tests WHERE id = ? LIMIT 1`, [testId]);
  if (!testRows[0]) return null;

  const [attemptRows] = await mysqlPool.query(
    `SELECT a.id, COALESCE(a.student_name, u.full_name, u.username, 'Student') AS student_name,
            a.started_at, a.submitted_at, r.score, r.max_score, r.time_taken_seconds, r.detail_json
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.test_id = ?
     ORDER BY a.submitted_at DESC, a.id DESC`,
    [testId]
  );

  const maxQuestionCount = attemptRows.reduce((max, row) => {
    let detail = [];
    try {
      detail = JSON.parse(row.detail_json || '[]');
    } catch {
      detail = [];
    }
    return Math.max(max, Array.isArray(detail) ? detail.length : 0);
  }, 0);

  const header = ['Student Name', 'Score', 'Time (seconds)', 'Submitted At'];
  for (let i = 1; i <= maxQuestionCount; i += 1) header.push(`Q${i}`);

  const rows = attemptRows.map((row) => {
    let detail = [];
    try {
      detail = JSON.parse(row.detail_json || '[]');
    } catch {
      detail = [];
    }
    const scoreText = `${Number(row.score || 0)}/${Number(row.max_score || 0)}`;
    const base = [row.student_name, scoreText, Number(row.time_taken_seconds || 0), row.submitted_at];
    for (let i = 0; i < maxQuestionCount; i += 1) {
      const answer = detail[i]?.selectedOption || detail[i]?.selectedOptionText || '';
      base.push(answer);
    }
    return base;
  });

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
  const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return {
    filename: `${slugify(testRows[0].title || 'test-results') || 'test-results'}-results.xlsx`,
    buffer: fileBuffer,
  };
}
