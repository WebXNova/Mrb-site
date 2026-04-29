import { mysqlPool } from '../config/mysql.js';

export async function getStudentDashboard(studentId) {
  const [courses] = await mysqlPool.query(
    `SELECT id, slug, title, subject, description, level, instructor
     FROM courses
     WHERE is_active = TRUE
     ORDER BY created_at DESC`
  );

  const [lectures] = await mysqlPool.query(
    `SELECT l.id, l.course_id, l.title, l.youtube_url, l.topic, l.sort_order, c.title AS course_title
     FROM lectures l
     INNER JOIN courses c ON c.id = l.course_id
     WHERE l.is_active = TRUE AND c.is_active = TRUE
     ORDER BY l.sort_order ASC, l.created_at DESC`
  );

  const [tests] = await mysqlPool.query(
    `SELECT id, title, subject, category, sub_category, duration_minutes, max_attempts, public_slug
     FROM tests
     WHERE status = 'published'
     ORDER BY updated_at DESC`
  );

  const [results] = await mysqlPool.query(
    `SELECT a.id AS attempt_id, t.title AS test_title, t.public_slug, a.submitted_at, r.score, r.max_score, r.percentage
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id
     INNER JOIN test_results r ON r.attempt_id = a.id
     WHERE a.user_id = ?
     ORDER BY a.submitted_at DESC`,
    [studentId]
  );

  return {
    courses: courses.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      subject: row.subject,
      description: row.description,
      level: row.level,
      instructor: row.instructor,
    })),
    lectures: lectures.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      courseTitle: row.course_title,
      title: row.title,
      youtubeUrl: row.youtube_url,
      topic: row.topic,
      sortOrder: row.sort_order,
    })),
    tests: tests.map((row) => ({
      id: row.id,
      title: row.title,
      subject: row.subject,
      category: row.category,
      subCategory: row.sub_category,
      durationMinutes: row.duration_minutes,
      maxAttempts: row.max_attempts,
      slug: row.public_slug,
    })),
    results: results.map((row) => ({
      attemptId: row.attempt_id,
      testTitle: row.test_title,
      slug: row.public_slug,
      submittedAt: row.submitted_at,
      score: row.score,
      maxScore: row.max_score,
      percentage: row.percentage,
    })),
  };
}

export async function getStudentResultByAttempt(studentId, attemptId) {
  const [rows] = await mysqlPool.query(
    `SELECT r.id, r.score, r.max_score, r.percentage, r.correct_count, r.wrong_count, r.skipped_count, r.time_taken_seconds, r.detail_json,
            t.title AS test_title, t.subject
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id
     WHERE a.id = ? AND a.user_id = ?
     LIMIT 1`,
    [attemptId, studentId]
  );
  const row = rows[0];
  if (!row) return null;
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
    details: JSON.parse(row.detail_json || '[]'),
  };
}
