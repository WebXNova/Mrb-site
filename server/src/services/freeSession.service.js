/**
 * Free Session — anonymous name-only start, post-submit enrollment profile, account claim.
 * Does not create course enrollments or payment records.
 */

import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { mysqlPool } from '../config/mysql.js';
import { getRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { FREE_SESSION_IDENTITY } from '../constants/freeSession.constants.js';
import { TEST_ACCESS_TYPE_FREE_STANDALONE, STANDALONE_TEST_JOIN_SQL } from '../constants/testAccessType.constants.js';
import { sanitizeGuestDisplayName } from '../validators/freeSessionName.js';
import { parseCreatePaidStandaloneRegistrationDto } from '../dtos/paidStandaloneRegistration.dto.js';
import {
  assertFreeStandaloneTestAccess,
} from '../security/cee/freeStandaloneAccess.service.js';
import {
  assertTestAvailabilityWindowForTest,
  AVAILABILITY_PHASE,
  fetchUtcNowMs,
  toAvailabilityIso,
} from './testAvailabilityWindow.service.js';
import { expireAttemptIfExpired } from './attemptExpiry.service.js';
import {
  initializeAttemptDeliveryLayout,
  isShuffleEnabled,
} from './attemptDeliveryLayout.service.js';
import {
  persistAttemptExamSnapshot,
  resolveAttemptExamSnapshot,
  snapshotQuestionsForGrading,
  snapshotGradingConfig,
} from './attemptExamSnapshot.service.js';
import { gradeComposedAttempt } from './testAttempt/gradeComposedAttempt.js';
import {
  INSERT_FREE_SESSION_GUEST_ATTEMPT_SQL,
  LOCK_PAID_STANDALONE_TEST_FOR_START_SQL,
} from './testAttempt.queries.js';
import { INSERT_PAID_STANDALONE_TEST_RESULT_SQL } from './testResult.queries.js';
import { assertValidTestDurationMinutes } from './attemptTiming.service.js';
import { derivePassStatus } from '../result/passStatus.js';
import { signAttemptToken } from './testAttempt.service.js';
import { isStudentResultVisible } from './testResultVisibility.service.js';

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 12;
const startRateMap = new Map();

async function checkFreeSessionStartRateLimit(slug, ipAddress) {
  const key = `${slug}:${ipAddress || 'unknown'}`;
  const redis = getRedisClient();
  if (redis) {
    const redisKey = `ratelimit:free-session-start:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, Math.floor(RATE_WINDOW_MS / 1000));
    }
    if (count > RATE_MAX_ATTEMPTS) {
      throw new ApiError(429, 'Too many start attempts. Please try again later.');
    }
    return;
  }
  const now = Date.now();
  const bucket = (startRateMap.get(key) || []).filter((value) => now - value < RATE_WINDOW_MS);
  if (bucket.length >= RATE_MAX_ATTEMPTS) {
    throw new ApiError(429, 'Too many start attempts. Please try again later.');
  }
  bucket.push(now);
  startRateMap.set(key, bucket);
}

function buildDeviceFingerprint(ipAddress, userAgent) {
  const raw = `${String(ipAddress || '').trim()}|${String(userAgent || '').trim().slice(0, 220)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function clientStartUrl(slug) {
  const base = String(env.clientUrl || '').replace(/\/$/, '');
  return `${base}/free-test/${slug}/start`;
}

function mapPendingStatus(row) {
  const status = String(row?.status || '');
  const identity = String(row?.identity_status || '');
  if (status === 'in_progress') {
    return {
      phase: 'in_progress',
      nextStep: 'exam',
      identityStatus: identity || FREE_SESSION_IDENTITY.IN_PROGRESS,
    };
  }
  if (status === 'submitted' && identity === FREE_SESSION_IDENTITY.CLAIMED) {
    return {
      phase: 'claimed',
      nextStep: 'result',
      identityStatus: identity,
    };
  }
  if (status === 'submitted' && identity === FREE_SESSION_IDENTITY.ACCOUNT_PENDING) {
    return {
      phase: 'account_pending',
      nextStep: 'account',
      identityStatus: identity,
    };
  }
  if (status === 'submitted') {
    return {
      phase: 'enrollment_pending',
      nextStep: 'enrollment',
      identityStatus: identity || FREE_SESSION_IDENTITY.ENROLLMENT_PENDING,
    };
  }
  return { phase: 'none', nextStep: 'start', identityStatus: null };
}

async function loadGuestAttemptForTest(executor, { testId, guestSessionHash, forUpdate = false }) {
  const sql = `
    SELECT a.id, a.status, a.identity_status, a.student_name, a.attempt_nonce,
           a.started_at, a.expires_at, a.submitted_at, a.result_id,
           a.enrollment_profile_json, a.pending_result_json, a.student_id, a.user_id,
           a.exam_snapshot_json, a.delivery_layout_json, a.test_id,
           t.public_slug, t.title, t.duration_minutes, t.show_result_immediately, t.results_released_at
    FROM test_attempts a
    INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
    WHERE a.test_id = ?
      AND a.guest_session_hash = ?
      AND a.user_id IS NULL
      AND a.student_id IS NULL
    ORDER BY a.id DESC
    LIMIT 1
    ${forUpdate ? 'FOR UPDATE' : ''}
  `;
  const [rows] = await executor.query(sql, [testId, guestSessionHash]);
  return rows[0] ?? null;
}

/**
 * @param {{ slug: string, guestSessionHash: string, studentName: unknown, ipAddress?: string, userAgent?: string }}
 */
export async function startFreeSessionAttempt({
  slug,
  guestSessionHash,
  studentName,
  ipAddress,
  userAgent,
}) {
  const normalizedSlug = String(slug || '').trim();
  const hash = String(guestSessionHash || '').trim();
  if (!normalizedSlug) {
    throw new ApiError(400, 'Invalid test link.');
  }
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw new ApiError(401, 'Session required.');
  }
  const name = sanitizeGuestDisplayName(studentName);
  await checkFreeSessionStartRateLimit(normalizedSlug, ipAddress);

  const [peekActive] = await mysqlPool.query(
    `SELECT a.id
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id
     WHERE t.public_slug = ?
       AND a.status = 'in_progress'
       AND a.guest_session_hash = ?
     LIMIT 1`,
    [normalizedSlug, hash]
  );
  const initialPhase = peekActive[0] ? AVAILABILITY_PHASE.IN_PROGRESS : AVAILABILITY_PHASE.CREATE_ATTEMPT;
  const access = await assertFreeStandaloneTestAccess({
    slug: normalizedSlug,
    userId: 0,
    guest: true,
    guestSessionHash: hash,
    phase: initialPhase,
  });
  const testId = Number(access.test.id);
  const deviceFingerprint = buildDeviceFingerprint(ipAddress, userAgent);
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();
    const nowMs = await fetchUtcNowMs(connection);

    const [[testWindowRow]] = await connection.query(LOCK_PAID_STANDALONE_TEST_FOR_START_SQL, [testId]);
    if (!testWindowRow || String(testWindowRow.test_access_type) !== TEST_ACCESS_TYPE_FREE_STANDALONE) {
      throw new ApiError(404, 'Test not found');
    }

    const existing = await loadGuestAttemptForTest(connection, {
      testId,
      guestSessionHash: hash,
      forUpdate: true,
    });

    if (existing && String(existing.status) === 'in_progress') {
      const expiredNow = await expireAttemptIfExpired({
        attemptId: existing.id,
        nowMs,
        executor: connection,
      });
      if (!expiredNow) {
        await assertFreeStandaloneTestAccess({
          slug: normalizedSlug,
          userId: 0,
          guest: true,
          guestSessionHash: hash,
          phase: AVAILABILITY_PHASE.IN_PROGRESS,
          nowMs,
          executor: connection,
        });
        assertTestAvailabilityWindowForTest(testWindowRow, {
          phase: AVAILABILITY_PHASE.IN_PROGRESS,
          nowMs,
          attemptStartedAt: existing.started_at,
          context: 'freeSession.start.resume',
        });
        const resumeNonce = String(existing.attempt_nonce || '');
        if (!resumeNonce) {
          throw new ApiError(500, 'Active attempt is missing security nonce');
        }
        if (name && name !== String(existing.student_name || '')) {
          await connection.query(
            `UPDATE test_attempts SET student_name = ? WHERE id = ? AND guest_session_hash = ? AND user_id IS NULL`,
            [name, existing.id, hash]
          );
        }
        await connection.commit();
        return {
          attemptId: Number(existing.id),
          attemptToken: signAttemptToken({
            attemptId: Number(existing.id),
            testId,
            slug: normalizedSlug,
            nonce: resumeNonce,
            userId: 0,
            expiresAt: existing.expires_at,
            durationMinutes: testWindowRow.duration_minutes,
            guest: true,
            sessionHash: hash,
          }),
          testId,
          startedAt: toAvailabilityIso(existing.started_at),
          expiresAt: toAvailabilityIso(existing.expires_at),
          startUrl: clientStartUrl(normalizedSlug),
          resumed: true,
          nextStep: 'exam',
        };
      }
    }

    if (existing && String(existing.status) === 'submitted') {
      await connection.commit();
      const mapped = mapPendingStatus(existing);
      return {
        attemptId: Number(existing.id),
        submitted: true,
        nextStep: mapped.nextStep,
        identityStatus: mapped.identityStatus,
        startUrl: clientStartUrl(normalizedSlug),
        resumed: false,
      };
    }

    await assertFreeStandaloneTestAccess({
      slug: normalizedSlug,
      userId: 0,
      guest: true,
      guestSessionHash: hash,
      phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
      nowMs,
      executor: connection,
    });

    assertTestAvailabilityWindowForTest(testWindowRow, {
      phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
      nowMs,
      context: 'freeSession.start.create',
    });

    const durationMinutes = assertValidTestDurationMinutes(testWindowRow.duration_minutes, {
      testId,
      context: 'freeSession.start.create',
    });
    const attemptNonce = nanoid(24);
    const [insertResult] = await connection.execute(INSERT_FREE_SESSION_GUEST_ATTEMPT_SQL, [
      name,
      durationMinutes,
      ipAddress || null,
      userAgent || null,
      deviceFingerprint,
      attemptNonce,
      hash,
      FREE_SESSION_IDENTITY.IN_PROGRESS,
      testId,
    ]);
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

    return {
      attemptId,
      attemptToken: signAttemptToken({
        attemptId,
        testId,
        slug: normalizedSlug,
        nonce: attemptNonce,
        userId: 0,
        expiresAt: timingRow?.expires_at,
        durationMinutes,
        guest: true,
        sessionHash: hash,
      }),
      testId,
      startedAt: toAvailabilityIso(timingRow?.started_at),
      expiresAt: toAvailabilityIso(timingRow?.expires_at),
      startUrl: clientStartUrl(normalizedSlug),
      resumed: false,
      nextStep: 'exam',
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Recover Free Session state from the guest cookie. Never trusts body IDs.
 */
export async function getFreeSessionStatus({ slug, guestSessionHash }) {
  const normalizedSlug = String(slug || '').trim();
  const hash = String(guestSessionHash || '').trim();
  if (!normalizedSlug) {
    throw new ApiError(400, 'Invalid test link.');
  }
  if (!hash) {
    return { phase: 'none', nextStep: 'start', attemptId: null };
  }

  const [rows] = await mysqlPool.query(
    `SELECT a.id, a.status, a.identity_status, a.student_name, a.started_at, a.expires_at, a.result_id,
            t.id AS test_id, t.show_result_immediately, t.results_released_at
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND ${STANDALONE_TEST_JOIN_SQL}
     WHERE t.public_slug = ?
       AND t.test_access_type = ?
       AND a.guest_session_hash = ?
       AND a.user_id IS NULL
       AND a.student_id IS NULL
     ORDER BY a.id DESC
     LIMIT 1`,
    [normalizedSlug, TEST_ACCESS_TYPE_FREE_STANDALONE, hash]
  );
  const row = rows[0];
  if (!row) {
    return { phase: 'none', nextStep: 'start', attemptId: null };
  }
  const mapped = mapPendingStatus(row);
  return {
    ...mapped,
    attemptId: Number(row.id),
    studentName: row.student_name ? String(row.student_name) : null,
    startedAt: toAvailabilityIso(row.started_at),
    expiresAt: toAvailabilityIso(row.expires_at),
    resultAvailable: mapped.phase === 'claimed' ? isStudentResultVisible(row) : false,
  };
}

/**
 * Store enrollment profile on the guest attempt. Does not create a course enrollment.
 */
export async function saveFreeSessionEnrollment({ slug, guestSessionHash, body }) {
  const normalizedSlug = String(slug || '').trim();
  const hash = String(guestSessionHash || '').trim();
  if (!normalizedSlug || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new ApiError(401, 'Your test session could not be found. Return using the original test link.');
  }
  const fields = parseCreatePaidStandaloneRegistrationDto(body);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [testRows] = await connection.query(
      `SELECT id FROM tests
       WHERE public_slug = ? AND test_access_type = ? AND course_id IS NULL AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [normalizedSlug, TEST_ACCESS_TYPE_FREE_STANDALONE]
    );
    const test = testRows[0];
    if (!test) {
      throw new ApiError(404, 'Test not found.');
    }
    const existing = await loadGuestAttemptForTest(connection, {
      testId: Number(test.id),
      guestSessionHash: hash,
      forUpdate: true,
    });
    if (!existing || String(existing.status) !== 'submitted') {
      throw new ApiError(409, 'Complete and submit the test before entering your information.', {
        code: 'FREE_SESSION_NOT_SUBMITTED',
      });
    }
    if (String(existing.identity_status) === FREE_SESSION_IDENTITY.CLAIMED) {
      await connection.commit();
      return { nextStep: 'result', identityStatus: FREE_SESSION_IDENTITY.CLAIMED, alreadyClaimed: true };
    }

    await connection.query(
      `UPDATE test_attempts
       SET enrollment_profile_json = ?, identity_status = ?
       WHERE id = ? AND guest_session_hash = ? AND user_id IS NULL AND student_id IS NULL`,
      [JSON.stringify(fields), FREE_SESSION_IDENTITY.ACCOUNT_PENDING, existing.id, hash]
    );
    await connection.commit();
    return {
      nextStep: 'account',
      identityStatus: FREE_SESSION_IDENTITY.ACCOUNT_PENDING,
      attemptId: Number(existing.id),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function parsePendingResult(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function gradeGuestAttemptFromSnapshot(connection, row) {
  const snapshot = await resolveAttemptExamSnapshot({
    attemptId: Number(row.id),
    testId: Number(row.test_id),
    examSnapshotJson: row.exam_snapshot_json,
    deliveryLayoutJson: row.delivery_layout_json,
    connection,
    executor: connection,
  });
  const composedQuestions = snapshotQuestionsForGrading(snapshot);
  const gradingConfig = snapshotGradingConfig(snapshot);
  const [answerRows] = await connection.query(
    `SELECT question_id, selected_option_id FROM student_answers WHERE attempt_id = ?`,
    [row.id]
  );
  const answersMap = new Map(
    answerRows.map((item) => [Number(item.question_id), Number(item.selected_option_id)])
  );
  const graded = gradeComposedAttempt(
    composedQuestions,
    answersMap,
    Number(gradingConfig.negativeMarking || 0),
    gradingConfig.passingMarks
  );
  return {
    totalQuestions: composedQuestions.length,
    correctCount: graded.correctCount,
    wrongCount: graded.wrongCount,
    skippedCount: graded.skippedCount,
    score: graded.score,
    maxScore: graded.maxScore,
    percentage: graded.percentage,
    details: graded.details,
    passStatus: derivePassStatus({
      score: graded.score,
      passingMarks: gradingConfig.passingMarks,
    }),
    timeTakenSeconds: Number(row.time_taken_seconds || 0),
  };
}

/**
 * Bind the current authenticated student to the guest attempt for this cookie+slug.
 * Does not trust attempt_id or user_id from the client.
 */
export async function claimFreeSessionAttempt({ slug, guestSessionHash, studentId }) {
  const normalizedSlug = String(slug || '').trim();
  const hash = String(guestSessionHash || '').trim();
  const uid = Number(studentId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  if (!normalizedSlug || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new ApiError(401, 'Your test session could not be found. Sign in from the original test link.');
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [testRows] = await connection.query(
      `SELECT id, public_slug, show_result_immediately, results_released_at
       FROM tests
       WHERE public_slug = ? AND test_access_type = ? AND course_id IS NULL AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [normalizedSlug, TEST_ACCESS_TYPE_FREE_STANDALONE]
    );
    const test = testRows[0];
    if (!test) {
      throw new ApiError(404, 'Test not found.');
    }
    const testId = Number(test.id);

    const guest = await loadGuestAttemptForTest(connection, {
      testId,
      guestSessionHash: hash,
      forUpdate: true,
    });
    if (!guest) {
      const [already] = await connection.query(
        `SELECT a.id, a.result_id, t.show_result_immediately, t.results_released_at
         FROM test_attempts a
         INNER JOIN tests t ON t.id = a.test_id
         WHERE a.test_id = ? AND (a.student_id = ? OR a.user_id = ?) AND a.identity_status = ?
         ORDER BY a.id DESC LIMIT 1`,
        [testId, uid, uid, FREE_SESSION_IDENTITY.CLAIMED]
      );
      if (already[0]) {
        await connection.commit();
        return {
          attemptId: Number(already[0].id),
          resultId: already[0].result_id != null ? Number(already[0].result_id) : null,
          nextStep: 'result',
          identityStatus: FREE_SESSION_IDENTITY.CLAIMED,
          resultAvailable: isStudentResultVisible(already[0]),
          recovered: true,
        };
      }
      throw new ApiError(404, 'No submitted test was found for this session.');
    }

    if (String(guest.status) !== 'submitted') {
      throw new ApiError(409, 'Submit the test before confirming your account.');
    }
    if (String(guest.identity_status) !== FREE_SESSION_IDENTITY.ACCOUNT_PENDING) {
      throw new ApiError(409, 'Complete your information before signing in.', {
        code: 'FREE_SESSION_ENROLLMENT_REQUIRED',
      });
    }

    const [owned] = await connection.query(
      `SELECT id FROM test_attempts
       WHERE test_id = ?
         AND (student_id = ? OR user_id = ?)
         AND id <> ?
       LIMIT 1
       FOR UPDATE`,
      [testId, uid, uid, guest.id]
    );
    if (owned[0]) {
      throw new ApiError(409, 'This account already has a result for this test.', {
        code: 'FREE_SESSION_ALREADY_OWNED',
      });
    }

    const [claimed] = await connection.execute(
      `UPDATE test_attempts
       SET student_id = ?, user_id = ?, identity_status = ?, claimed_at = UTC_TIMESTAMP(),
           guest_session_hash = NULL
       WHERE id = ? AND guest_session_hash = ? AND student_id IS NULL AND user_id IS NULL
         AND status = 'submitted' AND identity_status = ?`,
      [
        uid,
        uid,
        FREE_SESSION_IDENTITY.CLAIMED,
        guest.id,
        hash,
        FREE_SESSION_IDENTITY.ACCOUNT_PENDING,
      ]
    );
    if (Number(claimed?.affectedRows ?? 0) === 0) {
      throw new ApiError(409, 'This test attempt is no longer available to claim.');
    }

    let pending = parsePendingResult(guest.pending_result_json);
    if (!pending) {
      pending = await gradeGuestAttemptFromSnapshot(connection, guest);
    }

    const passStatus = pending.passStatus || derivePassStatus({ score: pending.score });
    try {
      await connection.execute(INSERT_PAID_STANDALONE_TEST_RESULT_SQL, [
        pending.totalQuestions,
        pending.correctCount,
        pending.wrongCount,
        pending.skippedCount,
        pending.score,
        pending.maxScore,
        pending.percentage,
        pending.correctCount,
        pending.wrongCount,
        pending.skippedCount,
        passStatus,
        pending.timeTakenSeconds,
        JSON.stringify(pending.details || []),
        guest.id,
        uid,
      ]);
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
    }

    const [resultRows] = await connection.query(
      `SELECT id FROM test_results WHERE attempt_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1`,
      [guest.id, uid]
    );
    const resultId = Number(resultRows[0]?.id);
    if (!resultId) {
      throw new ApiError(500, 'Could not save your result.');
    }
    await connection.query(
      `UPDATE test_attempts SET result_id = ?, pending_result_json = NULL WHERE id = ? AND student_id = ?`,
      [resultId, guest.id, uid]
    );

    await connection.commit();
    return {
      attemptId: Number(guest.id),
      resultId,
      nextStep: 'result',
      identityStatus: FREE_SESSION_IDENTITY.CLAIMED,
      resultAvailable: isStudentResultVisible(test),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
