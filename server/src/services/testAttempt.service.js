import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { getRedisClient } from '../config/redis.js';
import { ApiError } from '../utils/apiError.js';
import { sanitizeRichHtml } from '../utils/htmlSanitizer.js';
import { formatMySqlDateTime } from '../utils/dateTime.js';

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

export function verifyAttemptToken(rawToken) {
  if (!rawToken) throw new ApiError(401, 'Attempt token is required');
  try {
    const decoded = jwt.verify(rawToken, env.jwt.accessSecret);
    if (decoded.type !== 'test_attempt') throw new ApiError(401, 'Invalid attempt token');
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'Invalid or expired attempt token');
  }
}

export async function consumeAttemptNonce({ slug, attemptId, tokenNonce }) {
  const [rows] = await mysqlPool.query(
    `SELECT a.id, a.attempt_nonce, a.test_id
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id
     WHERE a.id = ? AND t.public_slug = ?
     LIMIT 1`,
    [attemptId, slug]
  );
  const row = rows[0];
  if (!row) throw new ApiError(404, 'Attempt not found');
  if (!tokenNonce || row.attempt_nonce !== tokenNonce) {
    throw new ApiError(401, 'Attempt token has been rotated. Retry with latest token.');
  }

  const nextNonce = nanoid(24);
  await mysqlPool.query(`UPDATE test_attempts SET attempt_nonce = ?, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    nextNonce,
    attemptId,
  ]);
  return signAttemptToken({
    type: 'test_attempt',
    attemptId,
    testId: row.test_id,
    slug,
    nonce: nextNonce,
  });
}

export async function verifyMrbCodeAndCreateAttempt({ slug, studentName, ipAddress, userAgent, studentUser }) {
  await checkVerifyRateLimit(slug, ipAddress);

  const [rows] = await mysqlPool.query(
    `SELECT id, title, duration_minutes, max_attempts, status
     FROM tests
     WHERE public_slug = ?
     LIMIT 1`,
    [slug]
  );
  const test = rows[0];
  if (!test || test.status !== 'published') throw new ApiError(404, 'Published test not found');

  const normalizedStudent = normalizeStudentKey(studentName || studentUser?.name);
  const deviceFingerprint = buildDeviceFingerprint(ipAddress, userAgent);
  const testMaxAttempts = Number(test.max_attempts || 1);
  if (testMaxAttempts > 0) {
    const [attemptCountRows] = await mysqlPool.query(
      `SELECT COUNT(*) AS total
       FROM test_attempts
       WHERE test_id = ?
         AND (
           (user_id IS NOT NULL AND user_id = ?)
           OR
           (student_name IS NOT NULL AND LOWER(TRIM(student_name)) = ?)
           OR device_fingerprint = ?
         )`,
      [test.id, studentUser?.id || 0, normalizedStudent || '__missing_student__', deviceFingerprint]
    );
    const usedAttempts = Number(attemptCountRows[0]?.total || 0);
    if (usedAttempts >= testMaxAttempts) {
      throw new ApiError(403, 'Maximum attempts reached for this student/device');
    }
  }

  const durationMinutes = Number(test.duration_minutes || 0);
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const expiresAtFormatted = formatMySqlDateTime(expiresAt, { fieldName: 'expires_at' });
  const attemptNonce = nanoid(24);
  const [insertResult] = await mysqlPool.query(
    `INSERT INTO test_attempts
     (test_id, user_id, student_name, access_code_label, status, started_at, expires_at, last_activity_at, ip_address, user_agent, device_fingerprint, used_code_hash, attempt_nonce)
     VALUES (?, ?, ?, ?, 'in_progress', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
    [
      test.id,
      studentUser?.id || null,
      studentName || studentUser?.name || null,
      'DIRECT',
      expiresAtFormatted,
      ipAddress || null,
      userAgent || null,
      deviceFingerprint,
      null,
      attemptNonce,
    ]
  );
  const attemptId = insertResult.insertId;

  const token = signAttemptToken({ type: 'test_attempt', attemptId, testId: test.id, slug, nonce: attemptNonce });
  return {
    attemptId,
    attemptToken: token,
    startUrl: `${String(env.clientUrl || '').replace(/\/$/, '')}/tests/${slug}/start`,
  };
}

export async function getAttemptTestForStart({ slug, attemptId }) {
  const [attemptRows] = await mysqlPool.query(
    `SELECT a.id, a.status, a.started_at, a.expires_at, a.test_id, t.title, t.description, t.subject, t.duration_minutes, t.show_explanations
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id
     WHERE a.id = ? AND t.public_slug = ? AND t.status = 'published'
     LIMIT 1`,
    [attemptId, slug]
  );
  const attempt = attemptRows[0];
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  if (attempt.status !== 'in_progress') throw new ApiError(409, 'Attempt already submitted');
  if (new Date(attempt.expires_at).getTime() < Date.now()) {
    throw new ApiError(410, 'Attempt has expired. Submit is no longer allowed.');
  }

  const [questions] = await mysqlPool.query(
    `SELECT id, question_text, question_image_url, options_json, marks, order_index
     FROM test_questions
     WHERE test_id = ?
     ORDER BY order_index ASC, id ASC`,
    [attempt.test_id]
  );

  return {
    attempt: {
      id: attempt.id,
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      status: attempt.status,
    },
    test: {
      title: attempt.title,
      description: attempt.description,
      subject: attempt.subject,
      durationMinutes: attempt.duration_minutes,
      showExplanations: !!attempt.show_explanations,
      questionCount: questions.length,
      questions: questions.map((row) => ({
        id: row.id,
        questionText: sanitizeRichHtml(row.question_text),
        questionImageUrl: row.question_image_url,
        options: JSON.parse(row.options_json || '[]').map((option) => ({ id: option.id, text: option.text })),
        marks: row.marks,
        orderIndex: row.order_index,
      })),
    },
  };
}

export async function saveAttemptAnswer({ attemptId, questionId, selectedOption }) {
  const [attemptRows] = await mysqlPool.query(`SELECT id, status, expires_at FROM test_attempts WHERE id = ? LIMIT 1`, [
    attemptId,
  ]);
  const attempt = attemptRows[0];
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  if (attempt.status !== 'in_progress') throw new ApiError(409, 'Attempt is already finalized');
  if (new Date(attempt.expires_at).getTime() < Date.now()) throw new ApiError(410, 'Attempt has expired');

  await mysqlPool.query(
    `INSERT INTO test_attempt_answers (attempt_id, question_id, selected_option, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE selected_option = VALUES(selected_option), updated_at = CURRENT_TIMESTAMP`,
    [attemptId, questionId, selectedOption]
  );
  await mysqlPool.query(`UPDATE test_attempts SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?`, [attemptId]);
  return { success: true };
}

export async function submitAttempt({ attemptId }) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [attemptRows] = await connection.query(
      `SELECT a.id, a.status, a.started_at, a.expires_at, a.test_id, t.negative_marking
       FROM test_attempts a
       INNER JOIN tests t ON t.id = a.test_id
       WHERE a.id = ?
       FOR UPDATE`,
      [attemptId]
    );
    const attempt = attemptRows[0];
    if (!attempt) throw new ApiError(404, 'Attempt not found');
    if (attempt.status !== 'in_progress') throw new ApiError(409, 'Attempt already submitted');

    const [questionRows] = await connection.query(
      `SELECT id, correct_option, marks, explanation, options_json, question_text
       FROM test_questions
       WHERE test_id = ?
       ORDER BY order_index ASC, id ASC`,
      [attempt.test_id]
    );
    const [answerRows] = await connection.query(
      `SELECT question_id, selected_option FROM test_attempt_answers WHERE attempt_id = ?`,
      [attemptId]
    );
    const answersMap = new Map(answerRows.map((row) => [Number(row.question_id), String(row.selected_option || '')]));

    let score = 0;
    let maxScore = 0;
    let correctCount = 0;
    const negativeMarking = Number(attempt.negative_marking || 0);
    let totalPenalty = 0;
    const details = questionRows.map((question) => {
      const marks = Number(question.marks || 1);
      maxScore += marks;
      const selectedOption = answersMap.get(Number(question.id)) || '';
      const isCorrect = selectedOption && selectedOption === question.correct_option;
      if (isCorrect) {
        score += marks;
        correctCount += 1;
      } else if (selectedOption && negativeMarking > 0) {
        totalPenalty += negativeMarking;
      }
      return {
        questionId: question.id,
        questionText: sanitizeRichHtml(question.question_text),
        options: JSON.parse(question.options_json || '[]'),
        selectedOption,
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
      Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000)
    );

    const [resultInsert] = await connection.query(
      `INSERT INTO test_results
       (attempt_id, score, max_score, percentage, correct_count, wrong_count, skipped_count, time_taken_seconds, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [attemptId, score, maxScore, percentage, correctCount, wrongCount, skippedCount, timeTakenSeconds, JSON.stringify(details)]
    );

    await connection.query(
      `UPDATE test_attempts
       SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, result_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [resultInsert.insertId, attemptId]
    );

    await connection.commit();
    return { attemptId, resultId: resultInsert.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getAttemptResult({ slug, attemptId }) {
  const [rows] = await mysqlPool.query(
    `SELECT r.id, r.score, r.max_score, r.percentage, r.correct_count, r.wrong_count, r.skipped_count, r.time_taken_seconds, r.detail_json,
            t.title, t.subject
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id
     INNER JOIN test_results r ON r.id = a.result_id
     WHERE a.id = ? AND t.public_slug = ?
     LIMIT 1`,
    [attemptId, slug]
  );
  const row = rows[0];
  if (!row) throw new ApiError(404, 'Result not found');
  return {
    resultId: row.id,
    testTitle: row.title,
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
