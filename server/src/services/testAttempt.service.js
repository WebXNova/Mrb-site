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
  assertTestAccessibleForEntitlement,
  resolveEntitledTestBySlug,
} from '../security/cee/testEntitlement.service.js';
import {
  createAttemptScopedQuery,
  assertQuestionBelongsToAttempt,
  assertOptionBelongsToQuestion,
  resolveSecureAttemptContext,
} from './testAttempt/secureAttemptContext.js';
import { loadTestSubjectPresentation } from './testSubjectPresentation.service.js';
import {
  loadComposedTestQuestions,
  mapComposedQuestionsForStudentAttempt,
  summarizeComposedQuestionOptions,
} from './testQuestionComposition.service.js';
import { LOAD_SAVED_ANSWERS_SQL } from './studentAttemptLoad.queries.js';
import { gradeComposedAttempt, parseSelectedOptionId } from './testAttempt/gradeComposedAttempt.js';
import {
  AttemptNotFoundError,
  AttemptTokenInvalidError,
  EntitlementRequiredError,
  InvalidOptionError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import { sanitizeRichHtml } from '../utils/htmlSanitizer.js';
import { ApiError } from '../utils/apiError.js';
import {
  assertValidTestDurationMinutes,
  logAttemptTimeCalculation,
} from './attemptTiming.service.js';
import { StructuredLogger } from '../utils/requestId.js';
import {
  logSecurityEvent,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';
import {
  COUNT_ENTITLED_STUDENT_ATTEMPTS_SQL,
  INSERT_ENTITLED_TEST_ATTEMPT_SQL,
  LOCK_ACTIVE_ENTITLED_ATTEMPT_SQL,
  NEXT_ENTITLED_ATTEMPT_NUMBER_SQL,
} from './testAttempt.queries.js';
import { INSERT_TEST_RESULT_SQL } from './testResult.queries.js';
import { derivePassStatus } from '../result/passStatus.js';
import { expireAttemptIfExpired } from './attemptExpiry.service.js';

const logger = new StructuredLogger({ service: 'testAttempt' });

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

function signAttemptToken(payload) {
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: '6h' });
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
    return decoded;
  } catch (error) {
    if (error instanceof AttemptTokenInvalidError) throw error;
    logger.warn('ATTEMPT_TOKEN_VALIDATION_FAILURE', {
      event: 'ATTEMPT_TOKEN_VALIDATION_FAILURE',
      reason: 'jwt_invalid_or_expired',
      detail: error instanceof Error ? error.message : String(error),
    });
    throw new AttemptTokenInvalidError({ reason: 'jwt_invalid_or_expired' });
  }
}

/**
 * Rotate attempt nonce after token validation (replay protection).
 * @param {{ slug: string, attemptId: number, tokenNonce: string, userId: number, courseId: number, entitlement?: import('./entitlement.service.js').EntitlementContext }}
 */
export async function consumeAttemptNonce({ slug, attemptId, tokenNonce, userId, courseId, entitlement }) {
  const ctx = await resolveSecureAttemptContext({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
    tokenNonce,
    requireInProgress: true,
    auditContext: 'testAttempt.consumeAttemptNonce',
  });

  const nextNonce = nanoid(24);
  const db = createAttemptScopedQuery(ctx.entitlement, 'testAttempt.consumeAttemptNonce.rotate');

  await db.execute(
    `UPDATE test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     SET a.attempt_nonce = ?, a.last_activity_at = CURRENT_TIMESTAMP
     WHERE a.id = ? AND a.user_id = ? AND a.status = 'in_progress'`,
    [ctx.courseId, nextNonce, ctx.attempt.id, ctx.userId]
  );

  return signAttemptToken({
    type: 'test_attempt',
    attemptId: ctx.attempt.id,
    testId: ctx.test.id,
    slug,
    nonce: nextNonce,
  });
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

  const test = await resolveEntitledTestBySlug(normalizedSlug, verified.courseId);
  const testId = Number(test?.id);

  if (!Number.isInteger(testId) || testId <= 0) {
    throw new ApiError(404, 'Test not found');
  }

  assertTestAccessibleForEntitlement(verified, test);

  logger.info('ATTEMPT_CREATE_REQUEST', {
    event: 'ATTEMPT_CREATE_REQUEST',
    studentId: normalizedStudentId,
    testId,
    slug: normalizedSlug,
    courseId: verified.courseId,
  });

  const deviceFingerprint = buildDeviceFingerprint(ipAddress, userAgent);
  const testMaxAttempts = Number(test.maxAttempts ?? 1);

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const db = createAttemptScopedQuery(
      verified,
      'testAttempt.createEntitledTestAttempt',
      connection
    );

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
        nowMs: Date.now(),
        executor: connection,
      });

      if (!expiredNow) {
        const resumeAttemptId = Number(activeAttempt.id);
        const resumeNonce = String(activeAttempt.attempt_nonce || '');
        if (!resumeNonce) {
          throw new ApiError(500, 'Active attempt is missing security nonce');
        }

        await connection.commit();

        const resumeToken = signAttemptToken({
          type: 'test_attempt',
          attemptId: resumeAttemptId,
          testId,
          slug: normalizedSlug,
          nonce: resumeNonce,
        });

        logger.info('ATTEMPT_CREATE_SUCCESS', {
          event: 'ATTEMPT_CREATE_SUCCESS',
          studentId: normalizedStudentId,
          testId,
          attemptId: resumeAttemptId,
          slug: normalizedSlug,
          resumed: true,
        });

        return {
          attemptId: resumeAttemptId,
          attemptToken: resumeToken,
          testId,
          startedAt: activeAttempt.started_at == null ? null : String(activeAttempt.started_at),
          expiresAt: activeAttempt.expires_at == null ? null : String(activeAttempt.expires_at),
          startUrl: `${String(env.clientUrl || '').replace(/\/$/, '')}/tests/${normalizedSlug}/start`,
          resumed: true,
        };
      }
    }

    if (testMaxAttempts > 0) {
      const countRows = await db.rows(COUNT_ENTITLED_STUDENT_ATTEMPTS_SQL, [
        verified.courseId,
        testId,
        normalizedStudentId,
        normalizedStudentId,
      ]);
      const usedAttempts = Number(countRows[0]?.total ?? 0);
      if (usedAttempts >= testMaxAttempts) {
        logSecurityEvent({
          action: TEST_SECURITY_ACTIONS.TEST_ATTEMPT_DENIED,
          userId: normalizedStudentId,
          testId,
          reason: 'max_attempts_reached',
          outcome: 'denied',
          context: 'testAttempt.createEntitledTestAttempt',
          metadata: {
            slug: normalizedSlug,
            courseId: verified.courseId,
            attemptsUsed: usedAttempts,
            maxAttempts: testMaxAttempts,
          },
        });
        throw new ApiError(403, 'Maximum attempts reached for this student/device');
      }
    }

    const [[nextRow]] = await connection.query(NEXT_ENTITLED_ATTEMPT_NUMBER_SQL, [
      testId,
      normalizedStudentId,
    ]);
    const attemptNumber = Number(nextRow?.next_attempt ?? 1);

    const durationMinutes = assertValidTestDurationMinutes(test.durationMinutes, {
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

    const [insertResult] = await db.execute(INSERT_ENTITLED_TEST_ATTEMPT_SQL, [
      testId,
      normalizedStudentId,
      normalizedStudentId,
      displayName,
      attemptNumber,
      durationMinutes,
      ipAddress || null,
      userAgent || null,
      deviceFingerprint,
      attemptNonce,
      testId,
      verified.courseId,
    ]);

    const attemptId = Number(insertResult?.insertId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      throw new ApiError(500, 'Failed to create test attempt');
    }

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
      type: 'test_attempt',
      attemptId,
      testId,
      slug: normalizedSlug,
      nonce: attemptNonce,
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

    return {
      attemptId,
      attemptToken: token,
      testId,
      startedAt: timingRow?.started_at == null ? null : String(timingRow.started_at),
      expiresAt: timingRow?.expires_at == null ? null : String(timingRow.expires_at),
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
 * Loads exam questions via question_bank composition (single source of truth).
 * @param {import('./testAttempt/secureAttemptContext.js').SecureAttemptContext} ctx
 * @param {import('mysql2/promise').PoolConnection} [connection]
 */
async function loadEntitledQuestions(ctx, connection) {
  const composed = await loadComposedTestQuestions(ctx.attempt.test_id, {
    audience: 'student',
    connection,
    logOrphans: true,
  });
  return mapComposedQuestionsForStudentAttempt(composed);
}

/**
 * Start attempt — load in-progress attempt + questions (getAttempt / loadQuestions).
 * @param {{ slug: string, attemptId: number, userId: number, courseId: number, entitlement?: import('./entitlement.service.js').EntitlementContext, tokenNonce?: string }}
 */
export async function getAttemptTestForStart({ slug, attemptId, userId, courseId, entitlement, tokenNonce }) {
  const ctx = await resolveSecureAttemptContext({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
    tokenNonce,
    requireInProgress: true,
    auditContext: 'testAttempt.getAttemptTestForStart',
  });

  const questions = await loadEntitledQuestions(ctx);
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
      startedAt: ctx.attempt.started_at,
      expiresAt: ctx.attempt.expires_at,
      status: ctx.attempt.status,
    },
    test: {
      title: ctx.test.title,
      description: ctx.test.description,
      subject: ctx.test.subject,
      durationMinutes: ctx.test.duration_minutes,
      showExplanations: !!ctx.test.show_explanations,
      questionCount: questions.length,
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
}) {
  const ctx = await resolveSecureAttemptContext({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
    tokenNonce,
    requireInProgress: true,
    auditContext: 'testAttempt.saveAttemptAnswer',
  });

  await assertQuestionBelongsToAttempt(ctx, questionId);

  let selectedOptionId;
  try {
    selectedOptionId = parseSelectedOptionId(selectedOption);
  } catch {
    throw new InvalidOptionError({ questionId, selectedOption, reason: 'invalid_option_id' });
  }

  await assertOptionBelongsToQuestion(questionId, selectedOptionId);

  await mysqlPool.query(
    `INSERT INTO student_answers (attempt_id, question_id, selected_option_id, answered_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       selected_option_id = VALUES(selected_option_id),
       answered_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    [ctx.attempt.id, questionId, selectedOptionId]
  );

  const db = createAttemptScopedQuery(ctx.entitlement, 'testAttempt.saveAttemptAnswer.touch');
  await db.execute(
    `UPDATE test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     SET a.last_activity_at = CURRENT_TIMESTAMP
     WHERE a.id = ? AND a.user_id = ? AND a.status = 'in_progress'`,
    [ctx.courseId, ctx.attempt.id, ctx.userId]
  );

  return { success: true };
}

/**
 * Submit in-progress attempt (transaction-safe, scoped reads).
 * @param {{ attemptId: number, userId: number, courseId: number, slug: string, entitlement?: import('./entitlement.service.js').EntitlementContext, tokenNonce?: string }}
 */
export async function submitAttempt({ attemptId, userId, courseId, slug, entitlement, tokenNonce }) {
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
      requireInProgress: true,
      forUpdate: true,
      connection,
      auditContext: 'testAttempt.submitAttempt',
    });

    const db = createAttemptScopedQuery(ctx.entitlement, 'testAttempt.submitAttempt', connection);

    const composedQuestions = await loadComposedTestQuestions(ctx.attempt.test_id, {
      audience: 'admin',
      connection,
      logOrphans: true,
    });

    const [answerRows] = await connection.query(
      `SELECT question_id, selected_option_id FROM student_answers WHERE attempt_id = ?`,
      [ctx.attempt.id]
    );
    const answersMap = new Map(
      answerRows.map((row) => [Number(row.question_id), Number(row.selected_option_id)])
    );

    const negativeMarking = Number(ctx.test.negative_marking || 0);
    const {
      score,
      maxScore,
      correctCount,
      wrongCount,
      skippedCount,
      percentage,
      details,
    } = gradeComposedAttempt(composedQuestions, answersMap, negativeMarking);
    const timeTakenSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(ctx.attempt.started_at).getTime()) / 1000)
    );

    const studentId = assertStudentIdForAttemptInsert(
      ctx.attempt.student_id ?? ctx.userId
    );
    const totalQuestions = composedQuestions.length;
    const passStatus = derivePassStatus({
      percentage,
      passingPercentage: ctx.test.passing_percentage,
    });

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

    const resultRows = await db.rows(
      `SELECT r.id AS result_id
       FROM test_results r
       INNER JOIN test_attempts a ON a.id = r.attempt_id
       INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
       WHERE a.id = ? AND a.user_id = ?
       ORDER BY r.id DESC LIMIT 1`,
      [ctx.courseId, ctx.attempt.id, ctx.userId]
    );
    const resultId = resultRows[0]?.result_id;
    if (!resultId) {
      throw new ApiError(500, 'Failed to persist test result');
    }

    await db.execute(
      `UPDATE test_attempts a
       INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
       SET a.status = 'submitted', a.submitted_at = CURRENT_TIMESTAMP, a.completion_reason = ?, a.result_id = ?, a.updated_at = CURRENT_TIMESTAMP
       WHERE a.id = ? AND a.user_id = ? AND a.status = 'in_progress'`,
      [ctx.courseId, 'submitted', resultId, ctx.attempt.id, ctx.userId]
    );

    await connection.commit();
    return { attemptId: ctx.attempt.id, resultId: Number(resultId) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get submitted attempt result (getResult).
 * @param {{ slug: string, attemptId: number, userId: number, courseId: number, entitlement?: import('./entitlement.service.js').EntitlementContext, tokenNonce?: string }}
 */
export async function getAttemptResult({ slug, attemptId, userId, courseId, entitlement, tokenNonce }) {
  const ctx = await resolveSecureAttemptContext({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
    tokenNonce,
    requireSubmitted: true,
    auditContext: 'testAttempt.getAttemptResult',
  });

  const db = createAttemptScopedQuery(ctx.entitlement, 'testAttempt.getAttemptResult');

  const rows = await db.rows(
    `SELECT r.id, r.score, r.max_score, r.percentage, r.correct_count, r.wrong_count, r.skipped_count, r.time_taken_seconds, r.detail_json,
            t.title AS test_title, t.id AS test_id
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

  const subjectPresentation = await loadTestSubjectPresentation(Number(row.test_id));

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
    timeTakenSeconds: row.time_taken_seconds,
    details: JSON.parse(row.detail_json || '[]').map((item) => ({
      ...item,
      questionText: sanitizeRichHtml(item.questionText),
      explanation: sanitizeRichHtml(item.explanation),
    })),
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
