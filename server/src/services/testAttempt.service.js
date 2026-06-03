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
  resolveSecureAttemptContext,
} from './testAttempt/secureAttemptContext.js';
import {
  AttemptNotFoundError,
  AttemptTokenInvalidError,
  EntitlementRequiredError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import { sanitizeRichHtml } from '../utils/htmlSanitizer.js';
import { formatMySqlDateTime } from '../utils/dateTime.js';
import { ApiError } from '../utils/apiError.js';

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

function normalizeStudentKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
    throw new AttemptTokenInvalidError({ reason: 'missing_token' });
  }
  try {
    const decoded = jwt.verify(rawToken, env.jwt.accessSecret);
    if (decoded.type !== 'test_attempt') {
      throw new AttemptTokenInvalidError({ reason: 'invalid_token_type' });
    }
    return decoded;
  } catch (error) {
    if (error instanceof AttemptTokenInvalidError) throw error;
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
 * @param {{ slug: string, studentName?: string|null, ipAddress?: string, userAgent?: string, studentUser: { id: number, name?: string }, entitlement: import('./entitlement.service.js').EntitlementContext }}
 */
export async function createEntitledTestAttempt({
  slug,
  studentName,
  ipAddress,
  userAgent,
  studentUser,
  entitlement,
}) {
  if (!entitlement?.courseId || !studentUser?.id) {
    throw new EntitlementRequiredError({ context: 'testAttempt.createEntitledTestAttempt' });
  }

  const verified = await assertCourseAccess(Number(studentUser.id), entitlement.courseId);

  await checkVerifyRateLimit(slug, ipAddress);

  const test = await resolveEntitledTestBySlug(slug, verified.courseId);
  assertTestAccessibleForEntitlement(verified, test);

  const db = createAttemptScopedQuery(verified, 'testAttempt.createEntitledTestAttempt');

  const normalizedStudent = normalizeStudentKey(studentName || studentUser?.name);
  const deviceFingerprint = buildDeviceFingerprint(ipAddress, userAgent);
  const testMaxAttempts = Number(test.maxAttempts ?? 1);

  if (testMaxAttempts > 0) {
    const countRows = await db.rows(
      `SELECT COUNT(*) AS total
       FROM test_attempts a
       INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
       WHERE a.test_id = ?
         AND (
           (a.user_id IS NOT NULL AND a.user_id = ?)
           OR (a.student_name IS NOT NULL AND LOWER(TRIM(a.student_name)) = ?)
           OR a.device_fingerprint = ?
         )`,
      [verified.courseId, test.id, studentUser.id, normalizedStudent || '__missing_student__', deviceFingerprint]
    );
    const usedAttempts = Number(countRows[0]?.total ?? 0);
    if (usedAttempts >= testMaxAttempts) {
      throw new ApiError(403, 'Maximum attempts reached for this student/device');
    }
  }

  const durationMinutes = Number(test.durationMinutes ?? 0);
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const expiresAtFormatted = formatMySqlDateTime(expiresAt, { fieldName: 'expires_at' });
  const attemptNonce = nanoid(24);

  const [insertResult] = await db.execute(
    `INSERT INTO test_attempts
       (test_id, user_id, student_name, access_code_label, status, started_at, expires_at, last_activity_at, ip_address, user_agent, device_fingerprint, used_code_hash, attempt_nonce)
     SELECT ?, ?, ?, 'DIRECT', 'in_progress', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?, ?, ?, NULL, ?
     FROM tests t
     WHERE t.id = ? AND t.course_id = ? AND t.status = 'published'
     LIMIT 1`,
    [
      test.id,
      studentUser.id,
      studentName || studentUser?.name || null,
      expiresAtFormatted,
      ipAddress || null,
      userAgent || null,
      deviceFingerprint,
      attemptNonce,
      test.id,
      verified.courseId,
    ]
  );

  const attemptId = Number(insertResult?.insertId);
  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    throw new ApiError(500, 'Failed to create test attempt');
  }

  const token = signAttemptToken({
    type: 'test_attempt',
    attemptId: Number(attemptId),
    testId: test.id,
    slug,
    nonce: attemptNonce,
  });

  return {
    attemptId: Number(attemptId),
    attemptToken: token,
    startUrl: `${String(env.clientUrl || '').replace(/\/$/, '')}/tests/${slug}/start`,
  };
}

/**
 * @param {import('./testAttempt/secureAttemptContext.js').SecureAttemptContext} ctx
 */
async function loadEntitledQuestions(ctx) {
  const db = createAttemptScopedQuery(ctx.entitlement, 'testAttempt.loadQuestions');
  const questions = await db.rows(
    `SELECT q.id, q.question_text, q.question_image_url, q.options_json, q.marks, q.order_index
     FROM test_questions q
     INNER JOIN tests t ON t.id = q.test_id AND t.course_id = ?
     WHERE q.test_id = ?
     ORDER BY q.order_index ASC, q.id ASC`,
    [ctx.courseId, ctx.attempt.test_id]
  );

  return questions.map((row) => ({
    id: row.id,
    questionText: sanitizeRichHtml(row.question_text),
    questionImageUrl: row.question_image_url,
    options: JSON.parse(row.options_json || '[]').map((option) => ({ id: option.id, text: option.text })),
    marks: row.marks,
    orderIndex: row.order_index,
  }));
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

  await mysqlPool.query(
    `INSERT INTO test_attempt_answers (attempt_id, question_id, selected_option, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE selected_option = VALUES(selected_option), updated_at = CURRENT_TIMESTAMP`,
    [ctx.attempt.id, questionId, selectedOption]
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

    const questionRows = await db.rows(
      `SELECT q.id, q.correct_option, q.marks, q.explanation, q.options_json, q.question_text
       FROM test_questions q
       INNER JOIN tests t ON t.id = q.test_id AND t.course_id = ?
       WHERE q.test_id = ?
       ORDER BY q.order_index ASC, q.id ASC`,
      [ctx.courseId, ctx.attempt.test_id]
    );

    const [answerRows] = await connection.query(
      `SELECT question_id, selected_option FROM test_attempt_answers WHERE attempt_id = ?`,
      [ctx.attempt.id]
    );
    const answersMap = new Map(answerRows.map((row) => [Number(row.question_id), String(row.selected_option || '')]));

    let score = 0;
    let maxScore = 0;
    let correctCount = 0;
    const negativeMarking = Number(ctx.test.negative_marking || 0);
    let totalPenalty = 0;

    const details = questionRows.map((question) => {
      const marks = Number(question.marks || 1);
      maxScore += marks;
      const selected = answersMap.get(Number(question.id)) || '';
      const isCorrect = selected && selected === question.correct_option;
      if (isCorrect) {
        score += marks;
        correctCount += 1;
      } else if (selected && negativeMarking > 0) {
        totalPenalty += negativeMarking;
      }
      return {
        questionId: question.id,
        questionText: sanitizeRichHtml(question.question_text),
        options: JSON.parse(question.options_json || '[]'),
        selectedOption: selected,
        correctOption: question.correct_option,
        explanation: sanitizeRichHtml(question.explanation),
        isCorrect,
        marks,
      };
    });

    score = Math.max(0, score - totalPenalty);
    const wrongCount = details.filter((item) => item.selectedOption && !item.isCorrect).length;
    const skippedCount = details.filter((item) => !item.selectedOption).length;
    const percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(2)) : 0;
    const timeTakenSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(ctx.attempt.started_at).getTime()) / 1000)
    );

    await db.execute(
      `INSERT INTO test_results
         (attempt_id, score, max_score, percentage, correct_count, wrong_count, skipped_count, time_taken_seconds, detail_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM test_attempts a
       INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
       WHERE a.id = ? AND a.user_id = ?
       LIMIT 1`,
      [
        ctx.attempt.id,
        score,
        maxScore,
        percentage,
        correctCount,
        wrongCount,
        skippedCount,
        timeTakenSeconds,
        JSON.stringify(details),
        ctx.courseId,
        ctx.attempt.id,
        ctx.userId,
      ]
    );

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
       SET a.status = 'submitted', a.submitted_at = CURRENT_TIMESTAMP, a.result_id = ?, a.updated_at = CURRENT_TIMESTAMP
       WHERE a.id = ? AND a.user_id = ? AND a.status = 'in_progress'`,
      [ctx.courseId, resultId, ctx.attempt.id, ctx.userId]
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
            t.title AS test_title, t.subject
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

  return {
    resultId: row.id,
    testTitle: row.test_title,
    subject: row.subject,
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
