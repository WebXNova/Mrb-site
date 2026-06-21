import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  logTestCreated,
  logTestUpdated,
} from '../observability/lmsActionLogger.service.js';
import {
  createTestBasicInfo,
  duplicateTest,
  deleteTest,
  getTestById,
  getTestCompleteness,
  getTestRulesById,
  getTestSettingsById,
  listTests,
  publishTest,
  exportTestResultsWorkbook,
  updateTestBasicInfo,
  updateTestRules,
  updateTestSettings,
} from '../services/test.service.js';
import { getTestResultsAnalytics } from '../services/testResultsAnalytics.service.js';
import { LEGACY_ENDPOINT_DISABLED, rejectLifecycleFieldsInBody } from '../services/testLifecycle.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  assertTestBasicInfoWhitelist,
  testBasicInfoBodySchema,
} from '../validators/testBasicInfo.schema.js';
import {
  assertTestRulesWhitelist,
  parsePositiveTestIdParam,
  testRulesBodySchema,
} from '../validators/testRules.schema.js';
import {
  assertTestSettingsWhitelist,
  testSettingsBodySchema,
} from '../validators/testSettings.schema.js';
import { getTestCreateMetadata } from '../constants/testMetadata.constants.js';
import {
  logSecurityEvent,
  logSecurityEventFromRequest,
  TEST_SECURITY_ACTIONS,
} from '../services/testSecurityAudit.service.js';
import { assertTestCompletenessAccess } from '../services/testMutationAccess.service.js';
import { extractPublishedEditControls } from '../services/publishedTestEdit.service.js';
import { parseAdminListFilters, resolveHierarchyCourseScope } from '../utils/parseAdminListFilters.js';
import { mysqlPool } from '../config/mysql.js';

function rejectDeprecatedTestFields(body, auditContext = {}) {
  const forbidden = ['sub_category', 'subCategory', 'subject'];
  const present = forbidden.filter((key) => body && Object.prototype.hasOwnProperty.call(body, key));
  if (present.length) {
    if (present.includes('subject')) {
      logSecurityEvent({
        action: TEST_SECURITY_ACTIONS.INVALID_SUBJECT_INJECTION,
        testId: auditContext.testId ?? null,
        userId: auditContext.userId ?? null,
        reason: 'LEGACY_SUBJECT_FIELD_IN_BODY',
        errorCode: 'VALIDATION_ERROR',
        outcome: 'denied',
        metadata: { forbiddenFields: present },
      });
    }
    throw new ApiError(422, `Fields are no longer supported: ${present.join(', ')}`, {
      code: 'VALIDATION_ERROR',
      forbiddenFields: present,
    });
  }
}

export const getTests = asyncHandler(async (req, res) => {
  const queryKeys = Object.keys(req.query ?? {}).filter(
    (key) => req.query[key] != null && String(req.query[key]).trim() !== ''
  );

  if (queryKeys.length === 0) {
    sendSuccess(res, await listTests());
    return;
  }

  const parsed = parseAdminListFilters(req.query, { defaultLimit: 50, maxLimit: 200 });
  const scope = await resolveHierarchyCourseScope(mysqlPool, parsed);
  const result = await listTests({
    ...parsed,
    courseId: scope.courseId,
    subjectId: scope.subjectId,
  });
  sendSuccess(res, result);
});

export const getTest = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const test = await getTestById(testId);
  if (!test) {
    throw new ApiError(404, 'Test not found');
  }
  sendSuccess(res, test);
});

/** Step 1 form options — categories, test types, defaults (from server constants). */
export const getTestCreateOptions = asyncHandler(async (_req, res) => {
  sendSuccess(res, getTestCreateMetadata());
});

export const patchTestBasicInfo = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const { confirmPublishedEdit, expectedUpdatedAt, payload } = extractPublishedEditControls(req.body);
  rejectLifecycleFieldsInBody(payload, { testId, userId: req.user?.id });
  rejectDeprecatedTestFields(payload, { testId, userId: req.user?.id });

  const whitelist = assertTestBasicInfoWhitelist(payload);
  if (!whitelist.ok) {
    throw new ApiError(422, whitelist.error, { code: 'VALIDATION_ERROR', unknownKeys: whitelist.unknownKeys });
  }

  const parsed = testBasicInfoBodySchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid test basic info payload', parsed.error.flatten());
  }

  const result = await updateTestBasicInfo(testId, parsed.data, {
    userId: req.user?.id,
    role: req.user?.role,
    confirmPublishedEdit,
    expectedUpdatedAt,
  });

  logTestUpdated({
    userId: req.user?.id,
    entityId: testId,
    testId,
    role: req.user?.role,
    section: 'basic_info',
    courseId: parsed.data.course_id,
    testType: parsed.data.test_type,
    requestId: req.requestId ?? null,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.basic_info.update',
    entityType: 'test',
    entityId: String(testId),
    metadata: {
      courseId: parsed.data.course_id,
      testType: parsed.data.test_type,
    },
  });

  sendSuccess(res, result);
});

export const postTest = asyncHandler(async (req, res) => {
  rejectLifecycleFieldsInBody(req.body, { userId: req.user?.id });
  rejectDeprecatedTestFields(req.body, { userId: req.user?.id });

  const whitelist = assertTestBasicInfoWhitelist(req.body);
  if (!whitelist.ok) {
    throw new ApiError(422, whitelist.error, { code: 'VALIDATION_ERROR', unknownKeys: whitelist.unknownKeys });
  }

  const parsed = testBasicInfoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid test basic info payload', parsed.error.flatten());
  }

  const created = await createTestBasicInfo(parsed.data, req.user?.id ?? null);

  logTestCreated({
    userId: req.user?.id,
    entityId: created.testId,
    testId: created.testId,
    role: req.user?.role,
    courseId: parsed.data.course_id,
    testType: parsed.data.test_type,
    requestId: req.requestId ?? null,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.create',
    entityType: 'test',
    entityId: String(created.testId),
    metadata: {
      courseId: parsed.data.course_id,
      testType: parsed.data.test_type,
    },
  });

  sendSuccess(res, created, 201);
});

function parseTestIdParam(params) {
  const parsed = parsePositiveTestIdParam(params.testId);
  if (!parsed.ok) {
    throw new ApiError(400, 'Invalid test id', parsed.error);
  }
  return parsed.id;
}

export const getTestRules = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const rules = await getTestRulesById(testId);
  sendSuccess(res, rules);
});

export const patchTestRules = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const { confirmPublishedEdit, expectedUpdatedAt, payload } = extractPublishedEditControls(req.body);
  rejectLifecycleFieldsInBody(payload, { testId, userId: req.user?.id });

  const whitelist = assertTestRulesWhitelist(payload);
  if (!whitelist.ok) {
    throw new ApiError(422, whitelist.error, { code: 'VALIDATION_ERROR', unknownKeys: whitelist.unknownKeys });
  }

  const parsed = testRulesBodySchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid test rules payload', parsed.error.flatten());
  }

  const result = await updateTestRules(testId, parsed.data, {
    userId: req.user?.id,
    role: req.user?.role,
    confirmPublishedEdit,
    expectedUpdatedAt,
  });

  logTestUpdated({
    userId: req.user?.id,
    entityId: testId,
    testId,
    role: req.user?.role,
    section: 'rules',
    durationMinutes: parsed.data.duration_minutes,
    maxAttempts: parsed.data.max_attempts,
    requestId: req.requestId ?? null,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.rules.update',
    entityType: 'test',
    entityId: String(testId),
    metadata: {
      durationMinutes: parsed.data.duration_minutes,
      maxAttempts: parsed.data.max_attempts,
    },
  });

  sendSuccess(res, result);
});

export const getTestCompletenessHandler = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  await assertTestCompletenessAccess(testId, req.user?.id, req.user?.role);
  const report = await getTestCompleteness(testId, {
    userId: req.user?.id,
    role: req.user?.role,
  });
  sendSuccess(res, report);
});

export const getTestSettings = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const settings = await getTestSettingsById(testId);
  sendSuccess(res, settings);
});

export const patchTestSettings = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const { confirmPublishedEdit, expectedUpdatedAt, payload } = extractPublishedEditControls(req.body);
  rejectLifecycleFieldsInBody(payload, { testId, userId: req.user?.id });

  const whitelist = assertTestSettingsWhitelist(payload);
  if (!whitelist.ok) {
    throw new ApiError(422, whitelist.error, { code: 'VALIDATION_ERROR', unknownKeys: whitelist.unknownKeys });
  }

  const parsed = testSettingsBodySchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid test settings payload', parsed.error.flatten());
  }

  const result = await updateTestSettings(testId, parsed.data, {
    userId: req.user?.id,
    role: req.user?.role,
    confirmPublishedEdit,
    expectedUpdatedAt,
  });

  logTestUpdated({
    userId: req.user?.id,
    entityId: testId,
    testId,
    role: req.user?.role,
    section: 'settings',
    accessMode: parsed.data.access_mode,
    lifecycleStatus: result.lifecycle_status,
    requestId: req.requestId ?? null,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.settings.update',
    entityType: 'test',
    entityId: String(testId),
    metadata: {
      accessMode: parsed.data.access_mode,
      lifecycleStatus: result.lifecycle_status,
    },
  });

  sendSuccess(res, result);
});

/** Legacy PUT /admin/tests/:id — permanently disabled (wizard-only mutations). */
export const putTest = asyncHandler(async (req, res) => {
  logSecurityEventFromRequest(req, {
    action: TEST_SECURITY_ACTIONS.LEGACY_ENDPOINT_ACCESS,
    testId: Number(req.params.testId) || null,
    reason: 'PUT_admin_tests_disabled',
    errorCode: LEGACY_ENDPOINT_DISABLED,
    outcome: 'denied',
  });
  return res.status(410).json({
    success: false,
    error: LEGACY_ENDPOINT_DISABLED,
    message: 'Use wizard endpoints instead',
  });
});

export const removeTest = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const removed = await deleteTest(testId, { userId: req.user?.id, role: req.user?.role });
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

export const postTestPublish = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');

  logSecurityEventFromRequest(req, {
    action: TEST_SECURITY_ACTIONS.PUBLISH_ATTEMPT,
    testId,
    reason: 'publish_requested',
    outcome: 'allowed',
  });

  try {
    const updated = await publishTest(testId, {
      userId: req.user?.id,
      role: req.user?.role,
      requestId: req.requestId ?? null,
    });
    if (!updated) throw new ApiError(404, 'Test not found');

    logSecurityEventFromRequest(req, {
      action: TEST_SECURITY_ACTIONS.PUBLISH_SUCCESS,
      testId,
      reason: 'publish_completed',
      outcome: 'allowed',
      metadata: { publicSlug: updated.publicSlug ?? null },
    });

    await logActivity({
      userId: req.user?.id,
      role: req.user?.role,
      action: 'admin.test.publish',
      entityType: 'test',
      entityId: String(testId),
    });
    sendSuccess(res, updated);
  } catch (error) {
    logSecurityEventFromRequest(req, {
      action: TEST_SECURITY_ACTIONS.PUBLISH_FAILED,
      testId,
      reason: error?.message || 'publish_failed',
      errorCode: error?.errorCode || 'PUBLISH_FAILED',
      outcome: 'failure',
    });
    throw error;
  }
});

/** Legacy PUT publish — disabled; use POST /admin/tests/:id/publish only. */
export const putTestPublish = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  logSecurityEventFromRequest(req, {
    action: TEST_SECURITY_ACTIONS.LEGACY_ENDPOINT_ACCESS,
    testId: testId || null,
    reason: 'PUT_publish_disabled',
    errorCode: LEGACY_ENDPOINT_DISABLED,
    outcome: 'denied',
  });
  return res.status(410).json({
    success: false,
    error: LEGACY_ENDPOINT_DISABLED,
    message: 'Use POST /admin/tests/:id/publish instead',
  });
});

export const postDuplicateTest = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  logSecurityEventFromRequest(req, {
    action: TEST_SECURITY_ACTIONS.TEST_DUPLICATE,
    testId,
    reason: 'duplicate_requested',
    outcome: 'allowed',
  });
  const copied = await duplicateTest(testId, req.user?.id || null, {
    userId: req.user?.id,
    role: req.user?.role,
  });
  if (!copied) throw new ApiError(404, 'Test not found');
  sendSuccess(res, copied, 201);
});

export const getTestResultsExport = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const exported = await exportTestResultsWorkbook(testId, {
    userId: req.user?.id,
    role: req.user?.role,
  });
  if (!exported) throw new ApiError(404, 'Test not found');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
  res.send(exported.buffer);
});

export const getTestResultsAnalyticsHandler = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!testId) throw new ApiError(400, 'Invalid test id');
  const analytics = await getTestResultsAnalytics(testId);
  if (!analytics) throw new ApiError(404, 'Test not found');
  sendSuccess(res, analytics);
});
