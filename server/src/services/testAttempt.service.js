/**
 * CEE Test Attempt Service — entitlement-aware security boundary.
 *
 * All attempt operations resolve via secureAttemptContext (no controller trust).
 * Instructional reads/writes use scopedQuery with course_id enforcement.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { getRedisClient } from '../config/redis.js';
import { assertCourseAccess } from './entitlement.service.js';
import { scopedQuery } from '../security/cee/db/scopedQuery.js';
import {
  resolveEntitledTestBySlug,
} from '../security/cee/testEntitlement.service.js';
import {
  createAttemptScopedQuery,
  resolveSecureAttemptContext,
} from './testAttempt/secureAttemptContext.js';
import { loadTestSubjectPresentation } from './testSubjectPresentation.service.js';
import {
  mapComposedQuestionsForStudentAttempt,
  summarizeComposedQuestionOptions,
} from './testQuestionComposition.service.js';
import {
  initializeAttemptDeliveryLayout,
  isShuffleEnabled,
} from './attemptDeliveryLayout.service.js';
import {
  persistAttemptExamSnapshot,
  resolveAttemptExamSnapshot,
  snapshotQuestionsForStudent,
  snapshotQuestionsForGrading,
  snapshotSectionsForStudent,
  snapshotGradingConfig,
  assertAnswerBelongsToExamSnapshot,
} from './attemptExamSnapshot.service.js';
import { LOAD_SAVED_ANSWERS_SQL } from './studentAttemptLoad.queries.js';
import { buildPresentationSettings } from '../utils/testPresentation.js';
import { gradeComposedAttempt, parseSelectedOptionId } from './testAttempt/gradeComposedAttempt.js';
import {
  AttemptExpiredError,
  AttemptNotFoundError,
  AttemptTokenInvalidError,
  EntitlementRequiredError,
  InvalidOptionError,
  TestNotAccessibleError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import { sanitizeRichHtml } from '../utils/htmlSanitizer.js';
import { ApiError } from '../utils/apiError.js';
import {
  assertValidTestDurationMinutes,
  computeAttemptTimeTakenSeconds,
  logAttemptTimeCalculation,
  resolveAttemptTimeTakenSeconds,
  resolveAttemptJwtExpiresInSeconds,
  isWithinSubmitGraceWindow,
  SUBMIT_GRACE_MS,
} from './attemptTiming.service.js';
import { StructuredLogger } from '../utils/requestId.js';
import {
  logSecurityEvent,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';
import {
  COUNT_ENTITLED_STUDENT_ATTEMPTS_SQL,
  buildInsertEntitledTestAttemptParams,
  buildInsertPaidStandaloneTestAttemptParams,
  INSERT_ENTITLED_TEST_ATTEMPT_SQL,
  INSERT_PAID_STANDALONE_TEST_ATTEMPT_SQL,
  LOCK_ACTIVE_ENTITLED_ATTEMPT_SQL,
  LOCK_ENTITLED_TEST_FOR_START_SQL,
  LOCK_PAID_STANDALONE_TEST_FOR_START_SQL,
  NEXT_ENTITLED_ATTEMPT_NUMBER_SQL,
} from './testAttempt.queries.js';
import { INSERT_TEST_RESULT_SQL, INSERT_PAID_STANDALONE_TEST_RESULT_SQL } from './testResult.queries.js';
import { derivePassStatus } from '../result/passStatus.js';
import {
  assertStudentResultVisible,
  isStudentResultVisible,
  sanitizeGradingDetailItems,
} from './testResultVisibility.service.js';
import { findMatchingScoreBand } from './testScoreBands.service.js';
import {
  recordAttemptCreation,
  recordAttemptSubmission,
} from '../observability/studentRuntimeMetrics.service.js';
import {
  emitStudentRuntimeAudit,
  STUDENT_RUNTIME_AUDIT_EVENTS,
} from '../observability/studentRuntimeObservability.service.js';
import { expireAttemptIfExpired } from './attemptExpiry.service.js';
import {
  assertCanCreateNewTestAttempt,
} from './testRetakePolicy.service.js';
import { COUNT_STUDENT_ATTEMPTS_FOR_TEST_SQL } from './testRetakePolicy.queries.js';
import { STANDALONE_TEST_JOIN_SQL, TEST_ACCESS_TYPE_FREE_STANDALONE } from '../constants/testAccessType.constants.js';
import { FREE_SESSION_IDENTITY } from '../constants/freeSession.constants.js';
import { assertPaidStandaloneTestAccess } from '../security/cee/paidStandaloneAccess.service.js';
import { assertFreeStandaloneTestAccess } from '../security/cee/freeStandaloneAccess.service.js';
import { isStandaloneAccessType } from '../validators/testAccessType.js';
import { assertNotBlockedByExamIntegrity } from './examIntegrity.store.js';
import {
  assertTestAvailabilityWindowForTest,
  AVAILABILITY_PHASE,
  fetchUtcNowMs,
  getAvailabilityNowMs,
  parseTestAvailabilityInstant,
  toAvailabilityIso,
} from './testAvailabilityWindow.service.js';
import {
  finalizeAttemptAfterResult,
  loadAttemptSubmissionState,
  resolveSubmitAttemptOutcome,
} from './testSubmitRecovery.service.js';

const logger = new StructuredLogger({ service: 'testAttempt' });

async function assertStandaloneStartAccess({ slug, userId, phase, nowMs, executor }) {
  const db = executor ?? mysqlPool;
  const [peek] = await db.query(
    `SELECT test_access_type FROM tests WHERE public_slug = ? AND deleted_at IS NULL LIMIT 1`,
    [slug]
  );
  if (String(peek[0]?.test_access_type || '') === TEST_ACCESS_TYPE_FREE_STANDALONE) {
    return assertFreeStandaloneTestAccess({ slug, userId, phase, nowMs, executor: db });
  }
  return assertPaidStandaloneTestAccess({ slug, userId, phase, nowMs, executor: db });
}

/**
 * @param {import('./testAttempt/secureAttemptContext.js').SecureAttemptContext} ctx
 * @param {number} resultId
 * @param {{ recovered?: boolean, outcome?: string|null }} [meta]
 */
function buildSlugSubmitSuccess(ctx, resultId, meta = {}) {
  recordAttemptSubmission({ stack: 'slug' });
  emitStudentRuntimeAudit({
    event: STUDENT_RUNTIME_AUDIT_EVENTS.ATTEMPT_SUBMITTED,
    stack: 'slug',
    operation: 'submitAttempt',
    outcome: meta.recovered ? 'recovered' : 'success',
    userId: ctx.userId,
    courseId: ctx.courseId,
    attemptId: ctx.attempt.id,
    testId: ctx.attempt.test_id,
    metadata: {
      resultId: resultId != null ? Number(resultId) : null,
      recovered: Boolean(meta.recovered),
      recoveryOutcome: meta.outcome ?? null,
      guest: Boolean(ctx.guest),
      nextStep: meta.nextStep ?? null,
    },
  });
  if (ctx.guest) {
    return {
      attemptId: ctx.attempt.id,
      resultId: null,
      recovered: Boolean(meta.recovered),
      resultAvailable: false,
      nextStep: meta.nextStep || 'enrollment',
      identityStatus: meta.identityStatus || FREE_SESSION_IDENTITY.ENROLLMENT_PENDING,
    };
  }
  return {
    attemptId: ctx.attempt.id,
    resultId: Number(resultId),
    recovered: Boolean(meta.recovered),
    resultAvailable: isStudentResultVisible(ctx.test),
  };
}

function standaloneInProgressWhere(ctx) {
  if (ctx.guest) {
    return {
      sql: 'a.id = ? AND a.guest_session_hash = ? AND a.user_id IS NULL AND a.status = \'in_progress\'',
      params: [ctx.attempt.id, ctx.guestSessionHash],
    };
  }
  return {
    sql: 'a.id = ? AND a.user_id = ? AND a.status = \'in_progress\'',
    params: [ctx.attempt.id, ctx.userId],
  };
}

/**
 * Hard guard — never INSERT without a validated student identity.
 * @param {unknown} studentId
 * @returns {number}
 */
export function assertStudentIdForAttemptInsert(studentId) {
  const normalizedStudentId = Number(studentId);
  if (!Number.isInteger(normalizedStudentId) || normalizedStudentId <= 0) {
    throw new Error('MISSING_STUDENT_ID');
  }
  return normalizedStudentId;
}

/**
 * Fail-closed guard before entitled attempt INSERT — ids must be positive integers.
 *
 * @param {{ testId: unknown, courseId: unknown, studentId: unknown, slug?: string }} input
 */
export function assertEntitledAttemptInsertContext({ testId, courseId, studentId, slug }) {
  const tid = Number(testId);
  const cid = Number(courseId);
  const sid = Number(studentId);

  if (!Number.isInteger(tid) || tid <= 0) {
    logger.error('ATTEMPT_INSERT_INVALID_CONTEXT', {
      event: 'ATTEMPT_INSERT_INVALID_CONTEXT',
      reason: 'invalid_test_id',
      testId,
      courseId: cid,
      studentId: sid,
      slug: slug ?? null,
    });
    throw new ApiError(400, 'Invalid test id for attempt creation.', {
      code: 'INVALID_TEST_ID',
      testId,
      slug: slug ?? null,
    });
  }

  if (!Number.isInteger(cid) || cid <= 0) {
    logger.error('ATTEMPT_INSERT_INVALID_CONTEXT', {
      event: 'ATTEMPT_INSERT_INVALID_CONTEXT',
      reason: 'invalid_course_id',
      testId: tid,
      courseId,
      studentId: sid,
      slug: slug ?? null,
    });
    throw new ApiError(400, 'Invalid course id for attempt creation.', {
      code: 'INVALID_COURSE_ID',
      courseId,
      slug: slug ?? null,
    });
  }

  if (!Number.isInteger(sid) || sid <= 0) {
    logger.error('ATTEMPT_INSERT_INVALID_CONTEXT', {
      event: 'ATTEMPT_INSERT_INVALID_CONTEXT',
      reason: 'invalid_student_id',
      testId: tid,
      courseId: cid,
      studentId,
      slug: slug ?? null,
    });
    throw new ApiError(400, 'Invalid student id for attempt creation.', {
      code: 'INVALID_STUDENT_ID',
      slug: slug ?? null,
    });
  }

  return { testId: tid, courseId: cid, studentId: sid };
}

/**
 * Resolve authenticated student id from JWT payload on req.user.
 * Canonical field: req.user.id (users.id / test_attempts.student_id).
 * @param {import('express').Request} req
 * @returns {number|null}
 */
export function resolveStudentIdFromRequest(req) {
  const candidates = [req.user?.id, req.user?.studentId, req.user?.userId];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }
  return null;
}

const attemptRateMap = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 12;

function cleanRateLimitBucket(bucket, now) {
  return bucket.filter((value) => now - value < RATE_WINDOW_MS);
}

async function checkVerifyRateLimit(slug, ipAddress) {
  const key = `${slug}:${ipAddress || 'unknown'}`;
  const redis = getRedisClient();
  if (redis) {
    const redisKey = `ratelimit:test-start:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, Math.floor(RATE_WINDOW_MS / 1000));
    }
    if (count > RATE_MAX_ATTEMPTS) {
      throw new ApiError(429, 'Too many verification attempts. Please try again later.');
    }
    return;
  }

  const now = Date.now();
  const bucket = cleanRateLimitBucket(attemptRateMap.get(key) || [], now);
  if (bucket.length >= RATE_MAX_ATTEMPTS) {
    throw new ApiError(429, 'Too many verification attempts. Please try again later.');
  }
  bucket.push(now);
  attemptRateMap.set(key, bucket);
}

/**
 * Bind the attempt JWT to the student (or guest session), attempt, and exam window.
 * Nonce is still present for submit replay protection, but autosave does not rotate it.
 */
export function signAttemptToken({
  attemptId,
  testId,
  slug,
  nonce,
  userId,
  expiresAt,
  durationMinutes,
  guest = false,
  sessionHash = null,
}) {
  const expiresIn = resolveAttemptJwtExpiresInSeconds({ expiresAt, durationMinutes });
  const payload = {
    type: 'test_attempt',
    attemptId: Number(attemptId),
    testId: Number(testId),
    slug,
    nonce,
    userId: guest ? 0 : Number(userId),
    expiresAt: toAvailabilityIso(expiresAt),
  };
  if (guest) {
    payload.guest = true;
    payload.sessionHash = String(sessionHash || '');
  }
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn });
}

function buildDeviceFingerprint(ipAddress, userAgent) {
  const raw = `${String(ipAddress || '').trim()}|${String(userAgent || '').trim().slice(0, 220)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * @param {string|null} rawToken
 */
export function verifyAttemptToken(rawToken) {
  if (!rawToken) {
    logger.warn('ATTEMPT_TOKEN_VALIDATION_FAILURE', {
      event: 'ATTEMPT_TOKEN_VALIDATION_FAILURE',
      reason: 'missing_token',
    });
    throw new AttemptTokenInvalidError({ reason: 'missing_token' });
  }
  try {
    const decoded = jwt.verify(rawToken, env.jwt.accessSecret);
    if (decoded.type !== 'test_attempt') {
      logger.warn('ATTEMPT_TOKEN_VALIDATION_FAILURE', {
        event: 'ATTEMPT_TOKEN_VALIDATION_FAILURE',
        reason: 'invalid_token_type',
        attemptId: decoded?.attemptId ?? null,
      });
      throw new AttemptTokenInvalidError({ reason: 'invalid_token_type' });
    }
    const claimExpiresMs = parseTestAvailabilityInstant(decoded.expiresAt);
    if (claimExpiresMs != null && !isWithinSubmitGraceWindow(Date.now(), claimExpiresMs)) {
      throw new AttemptExpiredError({
        attemptId: decoded.attemptId ?? null,
        expiresAt: decoded.expiresAt,
        reason: 'token_expires_at',
      });
    }
    return decoded;
  } catch (error) {
    if (error instanceof AttemptTokenInvalidError || error instanceof AttemptExpiredError) throw error;
    logger.warn('ATTEMPT_TOKEN_VALIDATION_FAILURE', {
      event: 'ATTEMPT_TOKEN_VALIDATION_FAILURE',
      reason: 'jwt_invalid_or_expired',
      detail: error instanceof Error ? error.message : String(error),
    });
    throw new AttemptTokenInvalidError({ reason: 'jwt_invalid_or_expired' });
  }
}

/**
 * Idempotent retry after the attempt cookie was cleared by a prior successful submit.
 * Returns a submit success payload only when this student already submitted this attempt.
 */
export async function recoverAlreadySubmittedAttempt({ attemptId, userId, courseId, slug, entitlement }) {
  try {
    const ctx = await resolveSecureAttemptContext({
      attemptId,
      userId,
      courseId,
      slug,
      entitlement,
      requireInProgress: false,
      enforceAvailabilityWindow: false,
      auditContext: 'testAttempt.recoverAlreadySubmittedAttempt',
    });
    const status = String(ctx.attempt.status || '');
    if (status !== 'submitted' && status !== 'graded') {
      return null;
    }
    const resultId = ctx.attempt.result_id;
    if (!resultId) return null;
    return buildSlugSubmitSuccess(ctx, resultId, { recovered: true, outcome: 'already_submitted' });
  } catch {
    return null;
  }
}

export async function consumeAttemptNonce({ slug, attemptId, tokenNonce, userId, courseId, entitlement }) {
  const ctx = await resolveSecureAttemptContext({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
    tokenNonce,
    requireInProgress: true,
    expiryGraceMs: SUBMIT_GRACE_MS,
    auditContext: 'testAttempt.consumeAttemptNonce',
  });

  const nextNonce = nanoid(24);
  if (ctx.paidStandalone) {
    await mysqlPool.execute(
      `UPDATE test_attempts a
       INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
       SET a.attempt_nonce = ?, a.last_activity_at = CURRENT_TIMESTAMP
       WHERE a.id = ? AND a.user_id = ? AND a.status = 'in_progress'`,
      [nextNonce, ctx.attempt.id, ctx.userId]
    );
  } else {
    const db = createAttemptScopedQuery(ctx.entitlement, 'testAttempt.consumeAttemptNonce.rotate');
    await db.execute(
      `UPDATE test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     SET a.attempt_nonce = ?, a.last_activity_at = CURRENT_TIMESTAMP
     WHERE a.id = ? AND a.user_id = ? AND a.status = 'in_progress'`,
      [ctx.courseId, nextNonce, ctx.attempt.id, ctx.userId]
    );
  }

  return signAttemptToken({
    attemptId: ctx.attempt.id,
    testId: ctx.test.id,
    slug,
    nonce: nextNonce,
    userId: ctx.userId,
    expiresAt: ctx.attempt.expires_at,
    durationMinutes: ctx.test.duration_minutes,
  });
}

export async function createPaidStandaloneTestAttempt({
  slug,
  studentId,
  studentName,
  ipAddress,
  userAgent,
}) {
  const normalizedSlug = String(slug || '').trim();
  const normalizedStudentId = assertStudentIdForAttemptInsert(studentId);
  if (!normalizedSlug) {
    throw new ApiError(400, 'Cannot create test attempt without test slug');
  }

  await checkVerifyRateLimit(normalizedSlug, ipAddress);
  const [peekActive] = await mysqlPool.query(
    `SELECT a.id
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
     WHERE t.public_slug = ?
       AND a.status = 'in_progress'
       AND (a.student_id = ? OR a.user_id = ?)
     LIMIT 1`,
    [normalizedSlug, normalizedStudentId, normalizedStudentId]
  );
  const initialPhase = peekActive[0] ? AVAILABILITY_PHASE.IN_PROGRESS : AVAILABILITY_PHASE.CREATE_ATTEMPT;
  const access = await assertStandaloneStartAccess({
    slug: normalizedSlug,
    userId: normalizedStudentId,
    phase: initialPhase,
  });
  const testId = Number(access.test.id);
  const deviceFingerprint = buildDeviceFingerprint(ipAddress, userAgent);
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();
    const nowMs = await fetchUtcNowMs(connection);

    const [[testWindowRow]] = await connection.query(LOCK_PAID_STANDALONE_TEST_FOR_START_SQL, [testId]);
    if (!testWindowRow) {
      throw new ApiError(404, 'Test not found');
    }

    const [activeRows] = await connection.query(
      `SELECT a.id, a.attempt_nonce, a.started_at, a.expires_at
       FROM test_attempts a
       INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
       WHERE a.test_id = ?
         AND a.status = 'in_progress'
         AND (a.student_id = ? OR a.user_id = ?)
       ORDER BY a.id DESC
       LIMIT 1
       FOR UPDATE`,
      [testId, normalizedStudentId, normalizedStudentId]
    );
    const activeAttempt = activeRows[0];

    if (activeAttempt) {
      const expiredNow = await expireAttemptIfExpired({
        attemptId: activeAttempt.id,
        nowMs,
        executor: connection,
      });
      if (!expiredNow) {
        await assertStandaloneStartAccess({
          slug: normalizedSlug,
          userId: normalizedStudentId,
          phase: AVAILABILITY_PHASE.IN_PROGRESS,
          nowMs,
          executor: connection,
        });
        assertTestAvailabilityWindowForTest(testWindowRow, {
          phase: AVAILABILITY_PHASE.IN_PROGRESS,
          nowMs,
          attemptStartedAt: activeAttempt.started_at,
          context: 'testAttempt.createPaidStandaloneTestAttempt.resume',
        });
        const resumeNonce = String(activeAttempt.attempt_nonce || '');
        if (!resumeNonce) {
          throw new ApiError(500, 'Active attempt is missing security nonce');
        }
        await connection.commit();
        return {
          attemptId: Number(activeAttempt.id),
          attemptToken: signAttemptToken({
            attemptId: Number(activeAttempt.id),
            testId,
            slug: normalizedSlug,
            nonce: resumeNonce,
            userId: normalizedStudentId,
            expiresAt: activeAttempt.expires_at,
            durationMinutes: testWindowRow.duration_minutes,
          }),
          testId,
          startedAt: toAvailabilityIso(activeAttempt.started_at),
          expiresAt: toAvailabilityIso(activeAttempt.expires_at),
          startUrl: `${String(env.clientUrl || '').replace(/\/$/, '')}/tests/${normalizedSlug}/start`,
          resumed: true,
        };
      }
    }

    await assertStandaloneStartAccess({
      slug: normalizedSlug,
      userId: normalizedStudentId,
      phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
      nowMs,
      executor: connection,
    });

    assertTestAvailabilityWindowForTest(testWindowRow, {
      phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
      nowMs,
      context: 'testAttempt.createPaidStandaloneTestAttempt.create',
    });

    const [[countRow]] = await connection.query(COUNT_STUDENT_ATTEMPTS_FOR_TEST_SQL, [
      testId,
      normalizedStudentId,
      normalizedStudentId,
    ]);
    assertCanCreateNewTestAttempt(
      testWindowRow,
      { totalAttempts: Number(countRow?.total ?? 0), hasActiveAttempt: false },
      { testId, context: 'testAttempt.createPaidStandaloneTestAttempt' }
    );

    const [[nextRow]] = await connection.query(NEXT_ENTITLED_ATTEMPT_NUMBER_SQL, [
      testId,
      normalizedStudentId,
    ]);
    const attemptNumber = Number(nextRow?.next_attempt ?? 1);
    const durationMinutes = assertValidTestDurationMinutes(
      testWindowRow.duration_minutes,
      { testId, context: 'testAttempt.createPaidStandaloneTestAttempt' }
    );
    const attemptNonce = nanoid(24);
    const insertParams = buildInsertPaidStandaloneTestAttemptParams({
      testId,
      studentId: normalizedStudentId,
      studentName: studentName?.trim() || null,
      attemptNumber,
      durationMinutes,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      deviceFingerprint,
      attemptNonce,
    });

    const [insertResult] = await connection.execute(INSERT_PAID_STANDALONE_TEST_ATTEMPT_SQL, insertParams);
    const attemptId = Number(insertResult?.insertId);
    if (Number(insertResult?.affectedRows ?? 0) === 0 || !Number.isInteger(attemptId) || attemptId <= 0) {
      throw new ApiError(403, 'Cannot start a new attempt for this test.', {
        code: 'ATTEMPT_CREATE_DENIED',
        testId,
      });
    }

    await initializeAttemptDeliveryLayout({
      attemptId,
      testId,
      shuffleQuestions: isShuffleEnabled(testWindowRow.shuffle_questions),
      shuffleOptions: isShuffleEnabled(testWindowRow.shuffle_options),
      attemptNonce,
      connection,
    });
    await persistAttemptExamSnapshot({
      attemptId,
      testId,
      shuffleQuestions: isShuffleEnabled(testWindowRow.shuffle_questions),
      shuffleOptions: isShuffleEnabled(testWindowRow.shuffle_options),
      attemptNonce,
      testRow: testWindowRow,
      connection,
    });

    const [[timingRow]] = await connection.query(
      `SELECT a.started_at, a.expires_at FROM test_attempts a WHERE a.id = ? LIMIT 1`,
      [attemptId]
    );
    await connection.commit();

    recordAttemptCreation({ stack: 'slug', resumed: false });
    return {
      attemptId,
      attemptToken: signAttemptToken({
        attemptId,
        testId,
        slug: normalizedSlug,
        nonce: attemptNonce,
        userId: normalizedStudentId,
        expiresAt: timingRow?.expires_at,
        durationMinutes,
      }),
      testId,
      startedAt: toAvailabilityIso(timingRow?.started_at),
      expiresAt: toAvailabilityIso(timingRow?.expires_at),
      startUrl: `${String(env.clientUrl || '').replace(/\/$/, '')}/tests/${normalizedSlug}/start`,
      resumed: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Start a new entitled test attempt (verify-code / retry when allowed).
 * @param {{ slug: string, studentId: number, studentName?: string|null, ipAddress?: string, userAgent?: string, entitlement: import('./entitlement.service.js').EntitlementContext }}
 */
export async function createEntitledTestAttempt({
  slug,
  studentId,
  studentName,
  ipAddress,
  userAgent,
  entitlement,
}) {
  const normalizedSlug = String(slug || '').trim();
  let normalizedStudentId;

  if (!normalizedSlug) {
    throw new ApiError(400, 'Cannot create test attempt without test slug');
  }

  const [accessPeek] = await mysqlPool.query(
    `SELECT test_access_type FROM tests WHERE public_slug = ? AND deleted_at IS NULL LIMIT 1`,
    [normalizedSlug]
  );
  if (isStandaloneAccessType(accessPeek[0]?.test_access_type)) {
    return createPaidStandaloneTestAttempt({
      slug: normalizedSlug,
      studentId,
      studentName,
      ipAddress,
      userAgent,
    });
  }

  try {
    normalizedStudentId = assertStudentIdForAttemptInsert(studentId);
  } catch (error) {
    logger.error('ATTEMPT_CREATE_FAILURE', {
      event: 'ATTEMPT_CREATE_FAILURE',
      reason: 'MISSING_STUDENT_ID',
      slug: normalizedSlug,
      studentId,
    });
    logSecurityEvent({
      action: TEST_SECURITY_ACTIONS.TEST_ATTEMPT_DENIED,
      reason: 'missing_authenticated_student_identity',
      outcome: 'denied',
      context: 'testAttempt.createEntitledTestAttempt',
    });
    throw new ApiError(401, 'Missing authenticated student identity');
  }

  if (!entitlement?.courseId) {
    logSecurityEvent({
      action: TEST_SECURITY_ACTIONS.TEST_ATTEMPT_DENIED,
      userId: normalizedStudentId,
      reason: 'missing_course_entitlement',
      outcome: 'denied',
      context: 'testAttempt.createEntitledTestAttempt',
      metadata: { slug: normalizedSlug },
    });
    throw new EntitlementRequiredError({ context: 'testAttempt.createEntitledTestAttempt' });
  }

  const verified = await assertCourseAccess(normalizedStudentId, entitlement.courseId);

  await checkVerifyRateLimit(normalizedSlug, ipAddress);

  // Start requires student-visible access_mode (public) plus active course enrollment.
  const test = await resolveEntitledTestBySlug(normalizedSlug, verified.courseId);
  const testId = Number(test?.id);

  if (!Number.isInteger(testId) || testId <= 0) {
    throw new ApiError(404, 'Test not found');
  }

  await assertNotBlockedByExamIntegrity({ testId, userId: normalizedStudentId });

  logger.info('ATTEMPT_CREATE_REQUEST', {
    event: 'ATTEMPT_CREATE_REQUEST',
    studentId: normalizedStudentId,
    testId,
    slug: normalizedSlug,
    courseId: verified.courseId,
  });

  const deviceFingerprint = buildDeviceFingerprint(ipAddress, userAgent);

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const db = createAttemptScopedQuery(
      verified,
      'testAttempt.createEntitledTestAttempt',
      connection
    );

    const nowMs = await fetchUtcNowMs(connection);

    const [[testWindowRow]] = await connection.query(LOCK_ENTITLED_TEST_FOR_START_SQL, [
      testId,
      verified.courseId,
    ]);
    if (!testWindowRow) {
      throw new ApiError(404, 'Test not found');
    }

    assertTestAvailabilityWindowForTest(testWindowRow, {
      phase: AVAILABILITY_PHASE.ANY_ACCESS,
      nowMs,
      context: 'testAttempt.createEntitledTestAttempt',
    });

    const [activeRows] = await connection.query(LOCK_ACTIVE_ENTITLED_ATTEMPT_SQL, [
      verified.courseId,
      testId,
      normalizedStudentId,
      normalizedStudentId,
    ]);
    const activeAttempt = activeRows[0];

    if (activeAttempt) {
      const expiredNow = await expireAttemptIfExpired({
        attemptId: activeAttempt.id,
        nowMs,
        executor: connection,
      });

      if (!expiredNow) {
        assertTestAvailabilityWindowForTest(testWindowRow, {
          phase: AVAILABILITY_PHASE.IN_PROGRESS,
          nowMs,
          attemptStartedAt: activeAttempt.started_at,
          context: 'testAttempt.createEntitledTestAttempt.resume',
        });

        const resumeAttemptId = Number(activeAttempt.id);
        const resumeNonce = String(activeAttempt.attempt_nonce || '');
        if (!resumeNonce) {
          throw new ApiError(500, 'Active attempt is missing security nonce');
        }

        await connection.commit();

        const resumeToken = signAttemptToken({
          attemptId: resumeAttemptId,
          testId,
          slug: normalizedSlug,
          nonce: resumeNonce,
          userId: normalizedStudentId,
          expiresAt: activeAttempt.expires_at,
          durationMinutes: testWindowRow.duration_minutes,
        });

        logger.info('ATTEMPT_CREATE_SUCCESS', {
          event: 'ATTEMPT_CREATE_SUCCESS',
          studentId: normalizedStudentId,
          testId,
          attemptId: resumeAttemptId,
          slug: normalizedSlug,
          resumed: true,
        });

        recordAttemptCreation({ stack: 'slug', resumed: true });
        emitStudentRuntimeAudit({
          event: STUDENT_RUNTIME_AUDIT_EVENTS.ATTEMPT_CREATED,
          stack: 'slug',
          operation: 'startOrResume',
          outcome: 'success',
          userId: normalizedStudentId,
          courseId: verified.courseId,
          attemptId: resumeAttemptId,
          testId,
          slug: normalizedSlug,
          metadata: { resumed: true },
        });

        return {
          attemptId: resumeAttemptId,
          attemptToken: resumeToken,
          testId,
          startedAt: toAvailabilityIso(activeAttempt.started_at),
          expiresAt: toAvailabilityIso(activeAttempt.expires_at),
          startUrl: `${String(env.clientUrl || '').replace(/\/$/, '')}/tests/${normalizedSlug}/start`,
          resumed: true,
        };
      }
    }

    assertTestAvailabilityWindowForTest(testWindowRow, {
      phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
      nowMs,
      context: 'testAttempt.createEntitledTestAttempt.create',
    });

    const [[countRow]] = await connection.query(COUNT_STUDENT_ATTEMPTS_FOR_TEST_SQL, [
      testId,
      normalizedStudentId,
      normalizedStudentId,
    ]);
    const totalAttempts = Number(countRow?.total ?? 0);

    assertCanCreateNewTestAttempt(
      testWindowRow,
      { totalAttempts, hasActiveAttempt: false },
      { testId, context: 'testAttempt.createEntitledTestAttempt' }
    );

    const [[nextRow]] = await connection.query(NEXT_ENTITLED_ATTEMPT_NUMBER_SQL, [
      testId,
      normalizedStudentId,
    ]);
    const attemptNumber = Number(nextRow?.next_attempt ?? 1);

    const durationMinutes = assertValidTestDurationMinutes(testWindowRow.duration_minutes ?? test.durationMinutes, {
      testId,
      context: 'testAttempt.createEntitledTestAttempt',
    });

    logAttemptTimeCalculation(logger, {
      testId,
      studentId: normalizedStudentId,
      durationMinutes,
      slug: normalizedSlug,
    });

    const attemptNonce = nanoid(24);
    const displayName = studentName?.trim() || null;

    assertStudentIdForAttemptInsert(normalizedStudentId);

    assertEntitledAttemptInsertContext({
      testId,
      courseId: verified.courseId,
      studentId: normalizedStudentId,
      slug: normalizedSlug,
    });

    const insertParams = buildInsertEntitledTestAttemptParams({
      testId,
      courseId: verified.courseId,
      studentId: normalizedStudentId,
      studentName: displayName,
      attemptNumber,
      durationMinutes,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      deviceFingerprint,
      attemptNonce,
    });

    const [insertResult] = await db.execute(INSERT_ENTITLED_TEST_ATTEMPT_SQL, insertParams);

    const affectedRows = Number(insertResult?.affectedRows ?? 0);
    const attemptId = Number(insertResult?.insertId);
    if (affectedRows === 0 || !Number.isInteger(attemptId) || attemptId <= 0) {
      logger.error('ATTEMPT_INSERT_ZERO_ROWS', {
        event: 'ATTEMPT_INSERT_ZERO_ROWS',
        testId,
        courseId: verified.courseId,
        studentId: normalizedStudentId,
        slug: normalizedSlug,
        attemptNumber,
        durationMinutes,
        affectedRows,
        insertId: insertResult?.insertId ?? null,
        insertParams: {
          testId: insertParams[0],
          studentId: insertParams[1],
          userId: insertParams[2],
          studentName: insertParams[3],
          attemptNumber: insertParams[4],
          durationMinutes: insertParams[5],
          whereTestId: insertParams[10],
          whereCourseId: insertParams[11],
          retakeStudentId: insertParams[12],
          retakeUserId: insertParams[13],
        },
        allowRetake: testWindowRow.allow_retake,
        maxAttempts: testWindowRow.max_attempts,
      });
      logSecurityEvent({
        action: TEST_SECURITY_ACTIONS.TEST_ATTEMPT_DENIED,
        userId: normalizedStudentId,
        testId,
        reason: 'attempt_create_insert_denied',
        outcome: 'denied',
        context: 'testAttempt.createEntitledTestAttempt',
        metadata: { slug: normalizedSlug, allowRetake: testWindowRow.allow_retake, affectedRows },
      });
      throw new ApiError(403, 'Cannot start a new attempt for this test.', {
        code: 'ATTEMPT_CREATE_DENIED',
        testId,
      });
    }

    await initializeAttemptDeliveryLayout({
      attemptId,
      testId,
      shuffleQuestions: isShuffleEnabled(testWindowRow.shuffle_questions),
      shuffleOptions: isShuffleEnabled(testWindowRow.shuffle_options),
      attemptNonce,
      connection,
    });

    await persistAttemptExamSnapshot({
      attemptId,
      testId,
      shuffleQuestions: isShuffleEnabled(testWindowRow.shuffle_questions),
      shuffleOptions: isShuffleEnabled(testWindowRow.shuffle_options),
      attemptNonce,
      testRow: testWindowRow,
      connection,
    });

    const [[timingRow]] = await connection.query(
      `SELECT a.started_at, a.expires_at
       FROM test_attempts a
       INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
       WHERE a.id = ?
       LIMIT 1`,
      [verified.courseId, attemptId]
    );

    await connection.commit();

    const token = signAttemptToken({
      attemptId,
      testId,
      slug: normalizedSlug,
      nonce: attemptNonce,
      userId: normalizedStudentId,
      expiresAt: timingRow?.expires_at,
      durationMinutes,
    });

    logSecurityEvent({
      action: TEST_SECURITY_ACTIONS.TEST_ATTEMPT_CREATE,
      userId: normalizedStudentId,
      testId,
      outcome: 'allowed',
      context: 'testAttempt.createEntitledTestAttempt',
      metadata: {
        slug: normalizedSlug,
        courseId: verified.courseId,
        attemptId,
        attemptNumber,
      },
    });

    logger.info('ATTEMPT_CREATE_SUCCESS', {
      event: 'ATTEMPT_CREATE_SUCCESS',
      studentId: normalizedStudentId,
      testId,
      attemptId,
      attemptNumber,
      slug: normalizedSlug,
      resumed: false,
    });

    recordAttemptCreation({ stack: 'slug', resumed: false });
    emitStudentRuntimeAudit({
      event: STUDENT_RUNTIME_AUDIT_EVENTS.ATTEMPT_CREATED,
      stack: 'slug',
      operation: 'startOrResume',
      outcome: 'success',
      userId: normalizedStudentId,
      courseId: verified.courseId,
      attemptId,
      testId,
      slug: normalizedSlug,
      metadata: { resumed: false, attemptNumber },
    });

    return {
      attemptId,
      attemptToken: token,
      testId,
      startedAt: toAvailabilityIso(timingRow?.started_at),
      expiresAt: toAvailabilityIso(timingRow?.expires_at),
      startUrl: `${String(env.clientUrl || '').replace(/\/$/, '')}/tests/${normalizedSlug}/start`,
      resumed: false,
    };
  } catch (error) {
    await connection.rollback();

    logger.error('ATTEMPT_CREATE_FAILURE', {
      event: 'ATTEMPT_CREATE_FAILURE',
      studentId: normalizedStudentId,
      testId: Number.isInteger(testId) ? testId : null,
      slug: normalizedSlug,
      reason: error?.message || 'unknown',
      errorCode: error?.code || null,
    });

    if (error?.code === 'ER_DUP_ENTRY') {
      logger.warn('entitled test attempt duplicate race', {
        studentId: normalizedStudentId,
        testId,
        slug: normalizedSlug,
      });
      throw new ApiError(409, 'Could not start test attempt due to a concurrent request', {
        code: 'ATTEMPT_START_CONFLICT',
      });
    }

    if (!(error instanceof ApiError) && !(error instanceof EntitlementRequiredError)) {
      logSecurityEvent({
        action: TEST_SECURITY_ACTIONS.TEST_ATTEMPT_DENIED,
        userId: normalizedStudentId,
        testId: Number.isInteger(testId) ? testId : null,
        reason: 'attempt_create_failed',
        outcome: 'failure',
        context: 'testAttempt.createEntitledTestAttempt',
        metadata: { slug: normalizedSlug },
        errorCode: error?.code || null,
      });
    }

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Loads exam questions from the attempt snapshot (frozen at start).
 * @param {import('./testAttempt/secureAttemptContext.js').SecureAttemptContext} ctx
 * @param {import('mysql2/promise').PoolConnection} [connection]
 */
async function loadEntitledExamSnapshot(ctx, connection) {
  return resolveAttemptExamSnapshot({
    attemptId: ctx.attempt.id,
    testId: ctx.attempt.test_id,
    examSnapshotJson: ctx.attempt.exam_snapshot_json,
    deliveryLayoutJson: ctx.attempt.delivery_layout_json,
    attemptNonce: ctx.attempt.attempt_nonce,
    shuffleQuestions: isShuffleEnabled(ctx.test.shuffle_questions),
    shuffleOptions: isShuffleEnabled(ctx.test.shuffle_options),
    testRow: ctx.test,
    connection,
    executor: connection,
  });
}

/**
 * Start attempt — load in-progress attempt + questions (getAttempt / loadQuestions).
 * @param {{ slug: string, attemptId: number, userId: number, courseId: number, entitlement?: import('./entitlement.service.js').EntitlementContext, tokenNonce?: string }}
 */
export async function getAttemptTestForStart({
  slug,
  attemptId,
  userId,
  courseId,
  entitlement,
  tokenNonce,
  guestSessionHash,
}) {
  let ctx;
  try {
    ctx = await resolveSecureAttemptContext({
      attemptId,
      userId,
      courseId,
      slug,
      entitlement,
      tokenNonce,
      guestSessionHash,
      requireInProgress: true,
      auditContext: 'testAttempt.getAttemptTestForStart',
    });
  } catch (error) {
    if (String(error?.metadata?.reason || '') !== 'exam_integrity_blocked') {
      throw error;
    }
    const submitted = await submitAttempt({
      slug,
      attemptId,
      userId,
      courseId,
      entitlement,
      tokenNonce,
    });
    return {
      submitted: true,
      resultAvailable: submitted.resultAvailable !== false,
      attempt: {
        id: Number(attemptId),
        startedAt: null,
        expiresAt: null,
        status: 'submitted',
      },
      test: {
        title: '',
        description: null,
        subject: null,
        durationMinutes: 0,
        showExplanations: false,
        layoutMode: 'vertical',
        displayMode: 'all',
        fullPageMode: false,
        questionCount: 0,
        sections: [],
        questions: [],
      },
      savedAnswers: {},
    };
  }

  const snapshot = await loadEntitledExamSnapshot(ctx);
  const questions = mapComposedQuestionsForStudentAttempt(snapshotQuestionsForStudent(snapshot));
  const sections = snapshotSectionsForStudent(snapshot);
  const presentation = snapshot.presentation || {};
  const resolvedPresentation = buildPresentationSettings({
    ...ctx.test,
    ...presentation,
  });
  const optionStats = summarizeComposedQuestionOptions(questions);

  logger.info('ATTEMPT_START_QUESTIONS_LOADED', {
    event: 'ATTEMPT_START_QUESTIONS_LOADED',
    attemptId: ctx.attempt.id,
    testId: ctx.attempt.test_id,
    slug,
    questionCount: questions.length,
    optionStats,
  });

  const questionsMissingOptions = optionStats.filter((row) => row.optionCount < 2);
  if (questionsMissingOptions.length) {
    logger.warn('ATTEMPT_START_MCQ_MISSING_OPTIONS', {
      event: 'ATTEMPT_START_MCQ_MISSING_OPTIONS',
      attemptId: ctx.attempt.id,
      testId: ctx.attempt.test_id,
      slug,
      questionsMissingOptions,
    });
  }

  const [savedAnswerRows] = await mysqlPool.query(LOAD_SAVED_ANSWERS_SQL, [ctx.attempt.id]);
  const savedAnswers = Object.fromEntries(
    savedAnswerRows.map((row) => [
      String(row.question_id),
      row.selected_option_id == null ? null : Number(row.selected_option_id),
    ])
  );

  return {
    attempt: {
      id: ctx.attempt.id,
      startedAt: toAvailabilityIso(ctx.attempt.started_at),
      expiresAt: toAvailabilityIso(ctx.attempt.expires_at),
      status: ctx.attempt.status,
    },
    test: {
      title: presentation.title || ctx.test.title,
      description: ctx.test.description,
      subject: ctx.test.subject,
      durationMinutes: ctx.test.duration_minutes,
      showExplanations: !!ctx.test.show_explanations,
      layoutMode: resolvedPresentation.layoutMode,
      displayMode: resolvedPresentation.displayMode,
      fullPageMode: resolvedPresentation.fullPageMode,
      questionCount: questions.length,
      sections,
      questions,
    },
    savedAnswers,
  };
}

/**
 * @param {{ attemptId: number, questionId: number, selectedOption: string, userId: number, courseId: number, slug: string, entitlement?: import('./entitlement.service.js').EntitlementContext, tokenNonce?: string }}
 */
export async function saveAttemptAnswer({
  attemptId,
  questionId,
  selectedOption,
  userId,
  courseId,
  slug,
  entitlement,
  tokenNonce,
  guestSessionHash,
}) {
  const ctx = await resolveSecureAttemptContext({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
    tokenNonce,
    guestSessionHash,
    requireInProgress: true,
    auditContext: 'testAttempt.saveAttemptAnswer',
  });

  const snapshot = await loadEntitledExamSnapshot(ctx);
  await assertAnswerBelongsToExamSnapshot(snapshot, {
    attemptId: ctx.attempt.id,
    questionId,
    optionId: null,
  });

  let selectedOptionId;
  try {
    selectedOptionId = parseSelectedOptionId(selectedOption);
  } catch {
    throw new InvalidOptionError({ questionId, selectedOption, reason: 'invalid_option_id' });
  }

  await assertAnswerBelongsToExamSnapshot(snapshot, {
    attemptId: ctx.attempt.id,
    questionId,
    optionId: selectedOptionId,
  });

  await mysqlPool.query(
    `INSERT INTO student_answers (attempt_id, question_id, selected_option_id, answered_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       selected_option_id = VALUES(selected_option_id),
       answered_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    [ctx.attempt.id, questionId, selectedOptionId]
  );

  const db = ctx.paidStandalone
    ? {
        execute: (sql, params) => mysqlPool.execute(sql, params),
      }
    : createAttemptScopedQuery(ctx.entitlement, 'testAttempt.saveAttemptAnswer.touch');
  const owner = standaloneInProgressWhere(ctx);
  await db.execute(
    ctx.paidStandalone
      ? `UPDATE test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
     SET a.last_activity_at = CURRENT_TIMESTAMP
     WHERE ${owner.sql}`
      : `UPDATE test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     SET a.last_activity_at = CURRENT_TIMESTAMP
     WHERE a.id = ? AND a.user_id = ? AND a.status = 'in_progress'`,
    ctx.paidStandalone
      ? owner.params
      : [ctx.courseId, ctx.attempt.id, ctx.userId]
  );

  return { success: true };
}

/**
 * Submit in-progress attempt (transaction-safe, scoped reads).
 * @param {{ attemptId: number, userId: number, courseId: number, slug: string, entitlement?: import('./entitlement.service.js').EntitlementContext, tokenNonce?: string }}
 */
export async function submitAttempt({
  attemptId,
  userId,
  courseId,
  slug,
  entitlement,
  tokenNonce,
  guestSessionHash,
}) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const ctx = await resolveSecureAttemptContext({
      attemptId,
      userId,
      courseId,
      slug,
      entitlement,
      tokenNonce,
      guestSessionHash,
      requireInProgress: false,
      forUpdate: true,
      connection,
      auditContext: 'testAttempt.submitAttempt',
    });

    const db = ctx.paidStandalone
      ? {
          execute: (sql, params) => connection.execute(sql, params),
          rows: async (sql, params) => {
            const [r] = await connection.query(sql, params);
            return r;
          },
        }
      : createAttemptScopedQuery(ctx.entitlement, 'testAttempt.submitAttempt', connection);

    if (ctx.guest && ctx.attempt.status === 'submitted') {
      await connection.commit();
      const nextStep =
        ctx.attempt.identity_status === FREE_SESSION_IDENTITY.ACCOUNT_PENDING ? 'account' : 'enrollment';
      return buildSlugSubmitSuccess(ctx, null, {
        nextStep,
        identityStatus: ctx.attempt.identity_status || FREE_SESSION_IDENTITY.ENROLLMENT_PENDING,
      });
    }

    let submitRecoveryMeta = null;
    if (!ctx.guest) {
      const preflight = await resolveSubmitAttemptOutcome(db, {
        attemptId: ctx.attempt.id,
        courseId: ctx.courseId,
        userId: ctx.userId,
        status: ctx.attempt.status,
        resultId: ctx.attempt.result_id,
        paidStandalone: Boolean(ctx.paidStandalone),
      });

      submitRecoveryMeta =
        preflight.action === 'proceed' && preflight.recovered
          ? { recovered: preflight.recovered, outcome: preflight.outcome }
          : null;

      if (preflight.action === 'complete') {
        await connection.commit();
        return buildSlugSubmitSuccess(ctx, preflight.resultId, {
          recovered: preflight.recovered,
          outcome: preflight.outcome,
        });
      }
    }

    const nowMs = await getAvailabilityNowMs(connection);
    const expiresMs = parseTestAvailabilityInstant(ctx.attempt.expires_at);
    if (expiresMs != null && !isWithinSubmitGraceWindow(nowMs, expiresMs)) {
      throw new AttemptExpiredError({
        attemptId: ctx.attempt.id,
        expiresAt: ctx.attempt.expires_at,
      });
    }

    const snapshot = await loadEntitledExamSnapshot(ctx, connection);
    const composedQuestions = snapshotQuestionsForGrading(snapshot);
    const gradingConfig = snapshotGradingConfig(snapshot);

    const [answerRows] = await connection.query(
      `SELECT question_id, selected_option_id FROM student_answers WHERE attempt_id = ?`,
      [ctx.attempt.id]
    );
    const answersMap = new Map(
      answerRows.map((row) => [Number(row.question_id), Number(row.selected_option_id)])
    );

    const negativeMarking = Number(gradingConfig.negativeMarking || 0);
    const {
      score,
      maxScore,
      correctCount,
      wrongCount,
      skippedCount,
      percentage,
      details,
    } = gradeComposedAttempt(
      composedQuestions,
      answersMap,
      negativeMarking,
      gradingConfig.passingMarks
    );
    const timeTakenSeconds = computeAttemptTimeTakenSeconds(ctx.attempt.started_at, nowMs);
    logAttemptTimeCalculation(logger, {
      attemptId: ctx.attempt.id,
      startedAt: ctx.attempt.started_at,
      nowMs,
      timeTakenSeconds,
      context: 'testAttempt.submitAttempt',
    });

    const totalQuestions = composedQuestions.length;
    const passStatus = derivePassStatus({
      score,
      passingMarks: gradingConfig.passingMarks,
    });

    if (ctx.guest) {
      const pending = {
        totalQuestions,
        correctCount,
        wrongCount,
        skippedCount,
        score,
        maxScore,
        percentage,
        passStatus,
        timeTakenSeconds,
        details,
      };
      const owner = standaloneInProgressWhere(ctx);
      const [guestSubmit] = await connection.execute(
        `UPDATE test_attempts a
         INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
         SET a.status = 'submitted',
             a.submitted_at = UTC_TIMESTAMP(),
             a.completion_reason = 'submitted',
             a.score = ?,
             a.percentage = ?,
             a.time_taken_seconds = ?,
             a.identity_status = ?,
             a.pending_result_json = ?,
             a.last_activity_at = CURRENT_TIMESTAMP
         WHERE ${owner.sql}`,
        [
          score,
          percentage,
          timeTakenSeconds,
          FREE_SESSION_IDENTITY.ENROLLMENT_PENDING,
          JSON.stringify(pending),
          ...owner.params,
        ]
      );
      if (Number(guestSubmit?.affectedRows ?? 0) === 0) {
        await connection.commit();
        return buildSlugSubmitSuccess(ctx, null, {
          nextStep: 'enrollment',
          identityStatus: FREE_SESSION_IDENTITY.ENROLLMENT_PENDING,
        });
      }
      await connection.commit();
      return buildSlugSubmitSuccess(ctx, null, {
        nextStep: 'enrollment',
        identityStatus: FREE_SESSION_IDENTITY.ENROLLMENT_PENDING,
      });
    }

    const studentId = assertStudentIdForAttemptInsert(
      ctx.attempt.student_id ?? ctx.userId
    );

    try {
      if (ctx.paidStandalone) {
        await db.execute(INSERT_PAID_STANDALONE_TEST_RESULT_SQL, [
          totalQuestions,
          correctCount,
          wrongCount,
          skippedCount,
          score,
          maxScore,
          percentage,
          correctCount,
          wrongCount,
          skippedCount,
          passStatus,
          timeTakenSeconds,
          JSON.stringify(details),
          ctx.attempt.id,
          studentId,
        ]);
      } else {
        await db.execute(INSERT_TEST_RESULT_SQL, [
          totalQuestions,
          correctCount,
          wrongCount,
          skippedCount,
          score,
          maxScore,
          percentage,
          correctCount,
          wrongCount,
          skippedCount,
          passStatus,
          timeTakenSeconds,
          JSON.stringify(details),
          ctx.courseId,
          ctx.attempt.id,
          studentId,
        ]);
      }
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        const recovery = await resolveSubmitAttemptOutcome(db, {
          attemptId: ctx.attempt.id,
          courseId: ctx.courseId,
          userId: ctx.userId,
          status: 'in_progress',
          resultId: ctx.attempt.result_id,
          paidStandalone: Boolean(ctx.paidStandalone),
        });
        if (recovery.action === 'complete') {
          await connection.commit();
          return buildSlugSubmitSuccess(ctx, recovery.resultId, {
            recovered: true,
            outcome: recovery.outcome,
          });
        }
      }
      throw error;
    }

    const resultRows = await db.rows(
      ctx.paidStandalone
        ? `SELECT r.id AS result_id
       FROM test_results r
       INNER JOIN test_attempts a ON a.id = r.attempt_id
       INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
       WHERE a.id = ? AND a.user_id = ?
       ORDER BY r.id DESC LIMIT 1`
        : `SELECT r.id AS result_id
       FROM test_results r
       INNER JOIN test_attempts a ON a.id = r.attempt_id
       INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
       WHERE a.id = ? AND a.user_id = ?
       ORDER BY r.id DESC LIMIT 1`,
      ctx.paidStandalone
        ? [ctx.attempt.id, ctx.userId]
        : [ctx.courseId, ctx.attempt.id, ctx.userId]
    );
    const resultId = resultRows[0]?.result_id;
    if (!resultId) {
      throw new ApiError(500, 'Failed to persist test result');
    }

    const affected = await finalizeAttemptAfterResult(db, {
      attemptId: ctx.attempt.id,
      courseId: ctx.courseId,
      userId: ctx.userId,
      resultId: Number(resultId),
      paidStandalone: Boolean(ctx.paidStandalone),
    });

    if (affected === 0) {
      const recovery = await resolveSubmitAttemptOutcome(db, {
        attemptId: ctx.attempt.id,
        courseId: ctx.courseId,
        userId: ctx.userId,
        status: ctx.attempt.status,
        resultId: ctx.attempt.result_id,
        paidStandalone: Boolean(ctx.paidStandalone),
      });
      if (recovery.action === 'complete') {
        await connection.commit();
        return buildSlugSubmitSuccess(ctx, recovery.resultId, {
          recovered: recovery.recovered,
          outcome: recovery.outcome,
        });
      }

      const submissionState = await loadAttemptSubmissionState(db, {
        attemptId: ctx.attempt.id,
        courseId: ctx.courseId,
        userId: ctx.userId,
        paidStandalone: Boolean(ctx.paidStandalone),
      });
      logger.error('submitAttempt finalize returned zero affected rows', {
        event: 'SUBMIT_FINALIZE_FAILED',
        attemptId: ctx.attempt.id,
        userId: ctx.userId,
        courseId: ctx.courseId,
        testId: ctx.attempt.test_id,
        slug: ctx.test.public_slug,
        resultId: Number(resultId),
        attemptStatus: submissionState?.status ?? ctx.attempt.status,
        attemptResultId: submissionState?.attempt_result_id ?? ctx.attempt.result_id,
        persistedResultId: submissionState?.result_id ?? null,
        recoveryAction: recovery.action,
      });
      throw new ApiError(500, 'Failed to finalize attempt submission', {
        code: 'SUBMIT_FINALIZE_FAILED',
        attemptId: ctx.attempt.id,
      });
    }

    await connection.commit();
    return buildSlugSubmitSuccess(ctx, resultId, submitRecoveryMeta ?? undefined);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get submitted attempt result (getResult).
 * Idempotent — no attempt nonce; student session + ownership is enough.
 * @param {{ slug: string, attemptId: number, userId: number, courseId: number, entitlement?: import('./entitlement.service.js').EntitlementContext }}
 */
export async function getAttemptResult({ slug, attemptId, userId, courseId, entitlement }) {
  const ctx = await resolveSecureAttemptContext({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
    requireSubmitted: true,
    auditContext: 'testAttempt.getAttemptResult',
  });

  const rows = ctx.paidStandalone
    ? (
        await mysqlPool.query(
          `SELECT r.id, r.score, r.max_score, r.percentage, r.correct_count, r.wrong_count, r.skipped_count, r.time_taken_seconds, r.detail_json,
            t.title AS test_title, t.id AS test_id,
            t.show_result_immediately, t.show_answers_after_submit, t.show_explanations, t.results_released_at
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
     INNER JOIN test_results r ON r.attempt_id = a.id
     WHERE a.id = ? AND a.user_id = ? AND t.public_slug = ? AND a.status = 'submitted'
     LIMIT 1`,
          [ctx.attempt.id, ctx.userId, slug]
        )
      )[0]
    : await createAttemptScopedQuery(ctx.entitlement, 'testAttempt.getAttemptResult').rows(
        `SELECT r.id, r.score, r.max_score, r.percentage, r.correct_count, r.wrong_count, r.skipped_count, r.time_taken_seconds, r.detail_json,
            t.title AS test_title, t.id AS test_id,
            t.show_result_immediately, t.show_answers_after_submit, t.show_explanations, t.results_released_at
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     INNER JOIN test_results r ON r.attempt_id = a.id
     WHERE a.id = ? AND a.user_id = ? AND t.public_slug = ? AND a.status = 'submitted'
     LIMIT 1`,
        [ctx.courseId, ctx.attempt.id, ctx.userId, slug]
      );

  const row = rows[0];
  if (!row) {
    throw new AttemptNotFoundError({
      attemptId: ctx.attempt.id,
      userId: ctx.userId,
      courseId: ctx.courseId,
      reason: 'result_not_found',
    });
  }

  assertStudentResultVisible(row, {
    attemptId: ctx.attempt.id,
    context: 'testAttempt.getAttemptResult',
  });

  const subjectPresentation = await loadTestSubjectPresentation(Number(row.test_id));
  const rawDetails = JSON.parse(row.detail_json || '[]');
  const details = sanitizeGradingDetailItems(rawDetails, row);
  const matchingBand = await findMatchingScoreBand(Number(row.test_id), row.percentage);
  const scoreBandMessage =
    matchingBand?.message_html && String(matchingBand.message_html).trim()
      ? sanitizeRichHtml(matchingBand.message_html)
      : null;

  return {
    resultId: row.id,
    testTitle: row.test_title,
    subject: subjectPresentation.displayLabel,
    score: row.score,
    maxScore: row.max_score,
    percentage: row.percentage,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    skippedCount: row.skipped_count,
    timeTakenSeconds: resolveAttemptTimeTakenSeconds({
      startedAt: ctx.attempt.started_at,
      submittedAt: ctx.attempt.submitted_at,
      storedSeconds: row.time_taken_seconds,
    }),
    ...(details ? { details } : {}),
    ...(scoreBandMessage ? { scoreBandMessageHtml: scoreBandMessage } : {}),
  };
}

/** Aliases — security-equivalent entry points */
export const startAttempt = createEntitledTestAttempt;
export const retryAttempt = createEntitledTestAttempt;
export const getAttempt = getAttemptTestForStart;
export const loadQuestions = getAttemptTestForStart;
export const getResult = getAttemptResult;

/** @deprecated Use createEntitledTestAttempt */
export const createPublicTestAttempt = createEntitledTestAttempt;
