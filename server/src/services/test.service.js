import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import XLSX from 'xlsx';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { loadPublishedTestMetaBySlug } from './testQuestionComposition.service.js';
import { sanitizePlainText } from '../utils/plainTextSanitizer.js';
import { formatMySqlDateTime } from '../utils/dateTime.js';
import { AppError } from '../errors/base/AppError.js';
import { toAvailabilityIso } from './testAvailabilityWindow.service.js';
import { NOT_FOUND, PUBLISH_REQUIREMENTS_NOT_MET, TEST_IS_LOCKED, UNAUTHORIZED, VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';

import {
  getTestCompletenessReport,
  loadTestCompletenessRow,
  syncTestLifecycleStatus,
  TEST_LIFECYCLE_STATES,
} from './testCompleteness.service.js';
import { executePublishTestStatus } from './testLifecycle.service.js';
import { validatePublishEligibility } from './testPublishEligibility.service.js';
import {
  formatPublishResponse,
  isPublishIdempotentReplay,
  lockTestRowForPublish,
  PUBLISH_IDEMPOTENT_REPLAY_REASON,
} from './testPublishIdempotency.service.js';
import {
  enforceWizardWrite,
  getFullTestValidationReport,
  validateTestStateForCreate,
} from './testValidation.service.js';
import {
  auditPublishedTestEdit,
  buildPublishedEditMetadata,
  resolvePublishedEditContext,
} from './publishedTestEdit.service.js';
import { enforceUnpublishedTest, isTestReadOnlyStatus } from './publishedTestLock.service.js';
import {
  assertTestCompletenessAccess,
  assertTestMutationAccess,
} from './testMutationAccess.service.js';
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
  auditQuizDraftMaterialization,
  auditQuizDraftMaterializationFailure,
  materializeQuizDraftToRuntimeTables,
} from './testQuizDraftMaterialization.service.js';
import {
  recordPublishFailure,
  recordPublishSuccess,
} from '../observability/testPublishMetrics.service.js';
import {
  logPublishCompleted,
  logPublishFailed,
  logPublishMaterialized,
  logPublishReplay,
  logPublishStarted,
  logPublishStudentReadiness,
} from '../observability/testPublishObservability.service.js';
import { lmsActionLogger } from '../observability/lmsActionLogger.service.js';
import { evaluatePublishedTestStudentReadiness } from './publishedTestStudentReadiness.service.js';
import {
  loadTestSubjectPresentation,
  loadTestSubjectPresentationBatch,
} from './testSubjectPresentation.service.js';
import {
  computeTestTotalMarks,
  invalidateTestTotalMarksCache,
  validatePassingMarksAgainstTotal,
} from './testTotalMarks.service.js';
import { validatePassingMarks } from '../validators/questionMarks.validation.js';

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
    passingMarks: row.passing_marks != null ? Number(row.passing_marks) : 0,
    maxAttempts: row.max_attempts,
    negativeMarking: Number(row.negative_marking || 0),
    shuffleQuestions: !!row.shuffle_questions,
    shuffleOptions: !!row.shuffle_options,
    showExplanations: !!row.show_explanations,
    accessMode: row.access_mode || 'private',
    tags,
    status: row.status,
    isReadOnly: isTestReadOnlyStatus(row.status),
    publicSlug: row.public_slug || null,
    publicLink: buildPublicLink(row.public_slug),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTests(filters = {}) {
  const conditions = ['deleted_at IS NULL'];
  const params = [];

  if (filters.testId) {
    conditions.push('id = ?');
    params.push(filters.testId);
  }

  if (filters.courseId) {
    conditions.push('course_id = ?');
    params.push(filters.courseId);
  }

  if (filters.subjectId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM test_subjects ts WHERE ts.test_id = tests.id AND ts.subject_id = ?)`
    );
    params.push(filters.subjectId);
  }

  if (filters.status === 'published') {
    conditions.push("LOWER(status) = 'published'");
  } else if (filters.status === 'incomplete') {
    conditions.push("UPPER(status) = 'INCOMPLETE'");
  } else if (filters.status === 'draft') {
    conditions.push("LOWER(status) <> 'published' AND UPPER(status) <> 'INCOMPLETE'");
  }

  if (filters.dateFrom) {
    conditions.push('DATE(created_at) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push('DATE(created_at) <= ?');
    params.push(filters.dateTo);
  }

  const search = String(filters.search ?? '').trim();
  if (search) {
    const like = `%${search.replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim()}%`;
    conditions.push('(title LIKE ? OR description LIKE ? OR category LIKE ?)');
    params.push(like, like, like);
  }

  const whereSql = conditions.join(' AND ');
  const limit = filters.limit != null ? Number(filters.limit) : null;
  const offset = filters.offset != null ? Number(filters.offset) : 0;

  let total = null;
  if (limit != null) {
    const [[countRow]] = await mysqlPool.query(
      `SELECT COUNT(*) AS total FROM tests WHERE ${whereSql}`,
      params
    );
    total = Number(countRow?.total ?? 0);
  }

  let sql = `SELECT id, course_id, title, description, category, test_type, duration_minutes, passing_marks,
            max_attempts, negative_marking, shuffle_questions, shuffle_options,
            show_explanations, access_mode, tags_json, status, public_slug, created_at, updated_at
     FROM tests
     WHERE ${whereSql}
     ORDER BY created_at DESC`;

  const queryParams = [...params];
  if (limit != null) {
    sql += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);
  }

  const [rows] = await mysqlPool.query(sql, queryParams);
  const presentationByTestId = await loadTestSubjectPresentationBatch(rows.map((row) => Number(row.id)));
  const items = rows.map((row) => {
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

  if (limit != null) {
    return { items, total, limit, offset };
  }
  return items;
}

export async function getTestById(testId) {
  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, description, category, test_type, duration_minutes, passing_marks,
            max_attempts, negative_marking, shuffle_questions, shuffle_options,
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
    `SELECT id, duration_minutes, max_attempts, passing_marks, negative_marking
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
    passing_marks: row.passing_marks == null ? 0 : Number(row.passing_marks),
    negative_marking: Number(row.negative_marking ?? 0),
  };
}

/**
 * Step 2 — update rules & scoring on an existing test.
 * @param {number} testId
 * @param {{
 *   duration_minutes: number,
 *   max_attempts: number,
 *   passing_marks: number,
 *   negative_marking?: number,
 * }} payload
 */
export async function updateTestRules(testId, payload, access = {}) {
  const tid = Number(testId);
  if (access.userId != null) {
    await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
      action: 'update_rules',
    });
  }

  const publishContext = await resolvePublishedEditContext(tid, {
    confirmPublishedEdit: access.confirmPublishedEdit,
    expectedUpdatedAt: access.expectedUpdatedAt,
  });

  await enforceWizardWrite(tid, 'rules', mysqlPool, { allowPublishedEdit: publishContext.isPublished });

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

  const passingMarksResult = validatePassingMarks(payload.passing_marks);
  if (!passingMarksResult.ok) {
    throw new AppError({
      message: passingMarksResult.message,
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { testId: tid, field: 'passing_marks' },
    });
  }
  const passingMarks = passingMarksResult.marks;

  const totalMarks = await computeTestTotalMarks(tid);
  if (totalMarks > 0) {
    const totalValidation = validatePassingMarksAgainstTotal(passingMarks, totalMarks);
    if (!totalValidation.ok) {
      throw new AppError({
        message: totalValidation.message,
        errorCode: VALIDATION_ERROR,
        httpStatus: 422,
        isOperational: true,
        metadata: { testId: tid, passing_marks: passingMarks, total_marks: totalMarks },
      });
    }
  }

  const negativeMarking =
    payload.negative_marking === undefined
      ? Number(existing.negative_marking ?? 0)
      : Number(payload.negative_marking);

  await mysqlPool.query(
    `UPDATE tests
     SET duration_minutes = ?,
         max_attempts = ?,
         passing_marks = ?,
         negative_marking = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [durationMinutes, maxAttempts, passingMarks, negativeMarking, tid]
  );

  invalidateTestTotalMarksCache(tid);

  const report = await syncTestLifecycleStatus(tid);

  if (publishContext.isPublished) {
    await auditPublishedTestEdit({
      testId: tid,
      userId: access.userId ?? null,
      role: access.role ?? 'admin',
      section: 'rules',
      metadata: {
        durationMinutes,
        maxAttempts,
        passingMarks,
        attemptStats: publishContext.attemptStats,
      },
    });
  }

  return {
    testId: tid,
    updated: true,
    lifecycle_status: report?.lifecycle_status ?? TEST_LIFECYCLE_STATES.INCOMPLETE,
    ...buildPublishedEditMetadata(publishContext.attemptStats),
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
    start_date: toAvailabilityIso(row.start_date),
    end_date: toAvailabilityIso(row.end_date),
  };
}

/**
 * Step 3 — update behavioral settings and access control.
 * @param {number} testId
 * @param {Record<string, unknown>} payload
 */
export async function updateTestSettings(testId, payload, access = {}) {
  const tid = Number(testId);
  if (access.userId != null) {
    await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
      action: 'update_settings',
    });
  }

  const publishContext = await resolvePublishedEditContext(tid, {
    confirmPublishedEdit: access.confirmPublishedEdit,
    expectedUpdatedAt: access.expectedUpdatedAt,
  });

  await enforceWizardWrite(tid, 'settings', mysqlPool, { allowPublishedEdit: publishContext.isPublished });

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

  const startDate =
    payload.start_date == null ? null : formatMySqlDateTime(payload.start_date, { fieldName: 'start_date' });
  const endDate =
    payload.end_date == null ? null : formatMySqlDateTime(payload.end_date, { fieldName: 'end_date' });

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

  if (publishContext.isPublished) {
    await auditPublishedTestEdit({
      testId: tid,
      userId: access.userId ?? null,
      role: access.role ?? 'admin',
      section: 'settings',
      metadata: {
        accessMode: payload.access_mode,
        attemptStats: publishContext.attemptStats,
      },
    });
  }

  return {
    testId: tid,
    lifecycle_status: report?.lifecycle_status ?? TEST_LIFECYCLE_STATES.INCOMPLETE,
    ...buildPublishedEditMetadata(publishContext.attemptStats),
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
export async function updateTestBasicInfo(testId, payload, access = {}) {
  const tid = Number(testId);
  if (access.userId != null) {
    await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
      action: 'update_basic_info',
      targetCourseId: payload.course_id,
    });
  }

  const publishContext = await resolvePublishedEditContext(tid, {
    confirmPublishedEdit: access.confirmPublishedEdit,
    expectedUpdatedAt: access.expectedUpdatedAt,
  });

  await enforceWizardWrite(tid, 'basic', mysqlPool, { allowPublishedEdit: publishContext.isPublished });

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

    if (publishContext.isPublished) {
      await auditPublishedTestEdit({
        testId: tid,
        userId: access.userId ?? null,
        role: access.role ?? 'admin',
        section: 'basic_info',
        metadata: {
          courseId,
          testType,
          attemptStats: publishContext.attemptStats,
        },
      });
    }

    return {
      testId: tid,
      updated: true,
      test_type: testType,
      category,
      subject_ids: normalizedSubjectIds,
      lifecycle_status: report?.lifecycle_status ?? TEST_LIFECYCLE_STATES.INCOMPLETE,
      ...buildPublishedEditMetadata(publishContext.attemptStats),
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
  await enforceUnpublishedTest(tid, mysqlPool, {
    reason: 'DELETE_PUBLISHED_TEST_BLOCKED',
    action: TEST_SECURITY_ACTIONS.INVALID_TEST_MUTATION,
  });

  if (options.userId != null) {
    await assertTestMutationAccess(tid, options.userId, options.role ?? 'admin', {
      action: 'delete',
    });
  }

  logSecurityEvent({
    action: TEST_SECURITY_ACTIONS.TEST_DELETE,
    testId: tid,
    userId: options.userId ?? null,
    reason: 'test_hard_delete',
    outcome: 'allowed',
  });
  const [result] = await mysqlPool.query(`DELETE FROM tests WHERE id = ? AND deleted_at IS NULL`, [tid]);
  return result.affectedRows > 0;
}

/**
 * @param {number} testId
 * @param {{ userId?: number|null }} [options]
 */
export async function publishTest(testId, options = {}) {
  const tid = Number(testId);
  const userId = options.userId ?? null;
  const requestId = options.requestId ?? null;
  const startedAtMs = Date.now();

  logPublishStarted({ testId: tid, userId, entityId: tid, requestId });

  if (userId != null) {
    await assertTestMutationAccess(tid, userId, options.role ?? 'admin', {
      action: 'publish',
    });
  }

  const connection = await mysqlPool.getConnection();
  let materializationSummary = null;
  let idempotentReplay = false;
  let replayPublicSlug = null;
  /** @type {Record<string, unknown>|null} */
  let studentReadiness = null;

  try {
    await connection.beginTransaction();

    const lockedRow = await lockTestRowForPublish(connection, tid);
    if (isPublishIdempotentReplay(lockedRow)) {
      idempotentReplay = true;
      replayPublicSlug = lockedRow.public_slug ?? null;
      await connection.commit();
    } else {
      materializationSummary = await materializeQuizDraftToRuntimeTables(tid, userId, connection);

      logPublishMaterialized({
        testId: tid,
        userId,
        requestId,
        draftId: materializationSummary.draftId,
        draftVersion: materializationSummary.draftVersion,
        questionCount: materializationSummary.questionCount,
        replacedLinks: materializationSummary.replacedLinks,
        supersededCleanup: materializationSummary.supersededCleanup ?? null,
        materializationIdempotent: materializationSummary.idempotent,
      });

      await validatePublishEligibility(tid, connection, {
        throwOnFailure: true,
        userId,
      });

      const syncReport = await syncTestLifecycleStatus(tid, connection);
      if (!syncReport || syncReport.lifecycle_status !== TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH) {
        logTestValidationFailure({
          testId: tid,
          userId,
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

      const publicSlug = await resolvePublicSlugForTest(tid, connection);
      replayPublicSlug = publicSlug;
      await executePublishTestStatus(tid, publicSlug, connection);

      await connection.commit();

      await auditQuizDraftMaterialization(tid, userId, materializationSummary);

      studentReadiness = await evaluatePublishedTestStudentReadiness(tid);
      logPublishStudentReadiness({
        testId: tid,
        requestId,
        ready: studentReadiness.ready,
        questionCount: studentReadiness.questionCount,
        failedChecks: studentReadiness.checks.filter((check) => !check.pass).map((check) => check.id),
      });

      logSecurityEvent({
        action: TEST_SECURITY_ACTIONS.PUBLISH_SUCCESS,
        testId: tid,
        userId,
        outcome: 'allowed',
        metadata: {
          publicSlug,
          materializedQuestions: materializationSummary.questionCount,
          draftVersion: materializationSummary.draftVersion,
          idempotent: materializationSummary.idempotent,
          publishReplay: false,
          studentReady: studentReadiness.ready,
        },
      });
    }
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    recordPublishFailure({ durationMs, errorCode: error.errorCode || error.code });
    logPublishFailed({
      testId: tid,
      userId,
      requestId,
      durationMs,
      errorCode: error.errorCode || error.code || 'PUBLISH_FAILED',
      message: error.message,
    });

    try {
      await connection.rollback();
    } catch (rollbackError) {
      lmsActionLogger.error({
        event: 'PUBLISH_ROLLBACK_FAILED',
        testId: tid,
        userId,
        entityId: tid,
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }
    await auditQuizDraftMaterializationFailure(tid, userId, error);
    logSecurityEvent({
      action: TEST_SECURITY_ACTIONS.PUBLISH_FAILED,
      testId: tid,
      userId,
      outcome: 'failure',
      errorCode: error.errorCode || error.code,
      reason: error.message,
    });
    throw error;
  } finally {
    connection.release();
  }

  const durationMs = Date.now() - startedAtMs;

  if (idempotentReplay) {
    studentReadiness = await evaluatePublishedTestStudentReadiness(tid);
    logPublishStudentReadiness({
      testId: tid,
      requestId,
      ready: studentReadiness.ready,
      questionCount: studentReadiness.questionCount,
      replay: true,
      failedChecks: studentReadiness.checks.filter((check) => !check.pass).map((check) => check.id),
    });

    recordPublishSuccess({ durationMs, replay: true });
    logPublishReplay({
      testId: tid,
      userId,
      requestId,
      durationMs,
      publicSlug: replayPublicSlug,
      studentReady: studentReadiness.ready,
    });

    logSecurityEvent({
      action: TEST_SECURITY_ACTIONS.PUBLISH_SUCCESS,
      testId: tid,
      userId,
      outcome: 'allowed',
      reason: PUBLISH_IDEMPOTENT_REPLAY_REASON,
      metadata: {
        publicSlug: replayPublicSlug,
        publishReplay: true,
        studentReady: studentReadiness.ready,
      },
    });
  } else {
    recordPublishSuccess({
      durationMs,
      replay: false,
      questionCount: materializationSummary?.questionCount ?? null,
    });
    logPublishCompleted({
      testId: tid,
      userId,
      requestId,
      durationMs,
      publicSlug: replayPublicSlug,
      questionCount: materializationSummary?.questionCount ?? null,
      draftVersion: materializationSummary?.draftVersion ?? null,
      studentReady: studentReadiness?.ready ?? null,
    });
  }

  const test = await getTestById(tid);
  return formatPublishResponse(test, { idempotentReplay });
}

export async function getTestCompleteness(testId, access = {}) {
  if (access.userId != null) {
    await assertTestCompletenessAccess(testId, access.userId, access.role ?? 'admin', {
      action: 'completeness_read',
    });
  }

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

export async function duplicateTest(testId, createdBy = null, access = {}) {
  if (access.userId != null) {
    await assertTestMutationAccess(testId, access.userId, access.role ?? 'admin', {
      action: 'duplicate',
    });
  }

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

export async function exportTestResultsWorkbook(testId, access = {}) {
  if (access.userId != null) {
    await assertTestMutationAccess(testId, access.userId, access.role ?? 'admin', {
      action: 'export_results',
    });
  }

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
