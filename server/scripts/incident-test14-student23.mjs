import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const STUDENT_ID = 23;
const COURSE_ID = 37;
const TEST_ID = 14;
const SLUG = '1st-test-14';

async function q(label, sql, params = []) {
  const [rows] = await pool.query(sql, params);
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(rows, null, 2));
  return rows;
}

async function main() {
  const [[utcNow]] = await pool.query('SELECT UTC_TIMESTAMP() AS utc_now, NOW() AS local_now');
  console.log('=== SERVER TIME ===');
  console.log(JSON.stringify(utcNow, null, 2));

  const tests = await q('tests (id=14)', `
    SELECT id, course_id, title, public_slug, status, deleted_at,
           start_date, end_date, duration_minutes, max_attempts, allow_retake,
           (start_date IS NULL OR start_date <= UTC_TIMESTAMP()) AS start_ok,
           (end_date IS NULL OR end_date >= UTC_TIMESTAMP()) AS end_ok
    FROM tests WHERE id = ?
  `, [TEST_ID]);

  await q('tests (slug)', `
    SELECT id, course_id, title, public_slug, status, deleted_at,
           start_date, end_date, duration_minutes, max_attempts, allow_retake
    FROM tests WHERE public_slug = ?
  `, [SLUG]);

  await q('courses (id=37)', `
    SELECT id, title, is_active FROM courses WHERE id = ?
  `, [COURSE_ID]);

  await q('users (id=23)', `
    SELECT id, email, role, status FROM users WHERE id = ?
  `, [STUDENT_ID]);

  await q('enrollments (user=23)', `
    SELECT id, user_id, course_id, status, access_status, updated_at
    FROM enrollments WHERE user_id = ?
    ORDER BY updated_at DESC
  `, [STUDENT_ID]);

  await q('active enrollments (user=23)', `
    SELECT id, user_id, course_id, status, access_status
    FROM enrollments WHERE user_id = ? AND access_status = 'active'
  `, [STUDENT_ID]);

  const attempts = await q('test_attempts (test=14, student=23)', `
    SELECT id, test_id, student_id, user_id, attempt_number, status,
           started_at, expires_at, submitted_at, completion_reason, result_id,
           (status = 'in_progress') AS is_active,
           (expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP()) AS is_past_expires
    FROM test_attempts
    WHERE test_id = ? AND (student_id = ? OR user_id = ?)
    ORDER BY id
  `, [TEST_ID, STUDENT_ID, STUDENT_ID]);

  await q('test_attempts (all for test=14)', `
    SELECT id, student_id, user_id, attempt_number, status, started_at, expires_at, completion_reason
    FROM test_attempts WHERE test_id = ? ORDER BY id
  `, [TEST_ID]);

  const [[countRow]] = await pool.query(`
    SELECT COUNT(*) AS total FROM test_attempts
    WHERE test_id = ? AND (student_id = ? OR user_id = ?)
  `, [TEST_ID, STUDENT_ID, STUDENT_ID]);
  console.log('\n=== attempt count for student 23 on test 14 ===');
  console.log(JSON.stringify(countRow, null, 2));

  await q('active in_progress attempt', `
    SELECT a.id, a.attempt_nonce, a.started_at, a.expires_at, a.status
    FROM test_attempts a
    INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
    WHERE a.test_id = ? AND a.status = 'in_progress'
      AND (a.student_id = ? OR a.user_id = ?)
    ORDER BY a.id DESC LIMIT 1
  `, [COURSE_ID, TEST_ID, STUDENT_ID, STUDENT_ID]);

  await q('test_results for test 14 student 23', `
    SELECT r.id, r.attempt_id, r.student_id, r.test_id, r.percentage, r.grade, r.generated_at
    FROM test_results r
    INNER JOIN test_attempts a ON a.id = r.attempt_id
    WHERE r.test_id = ? AND (a.student_id = ? OR a.user_id = ?)
  `, [TEST_ID, STUDENT_ID, STUDENT_ID]);

  await q('student_answers for student 23 attempts on test 14', `
    SELECT sa.id, sa.attempt_id, sa.question_id, sa.selected_option_id
    FROM student_answers sa
    INNER JOIN test_attempts a ON a.id = sa.attempt_id
    WHERE a.test_id = ? AND (a.student_id = ? OR a.user_id = ?)
  `, [TEST_ID, STUDENT_ID, STUDENT_ID]);

  // Simulate LOCK_ENTITLED_TEST_FOR_START_SQL
  await q('LOCK_ENTITLED_TEST_FOR_START_SQL sim', `
    SELECT id, start_date, end_date, duration_minutes, max_attempts, allow_retake,
           shuffle_questions, shuffle_options, status, course_id
    FROM tests t
    WHERE t.id = ? AND t.course_id = ? AND t.status = 'published'
    LIMIT 1
  `, [TEST_ID, COURSE_ID]);

  // Simulate slug resolution
  await q('resolveEntitledTestBySlug sim (course=37)', `
    SELECT id, course_id, title, status, public_slug, duration_minutes, max_attempts, access_mode
    FROM tests
    WHERE public_slug = ? AND status = 'published' AND course_id = ?
    LIMIT 1
  `, [SLUG, COURSE_ID]);

  // Simulate INSERT guard - would SELECT return a row?
  const test = tests[0];
  if (test) {
    const [[insertGuard]] = await pool.query(`
      SELECT t.id AS would_insert
      FROM tests t
      WHERE t.id = ? AND t.course_id = ? AND t.status = 'published'
        AND (t.start_date IS NULL OR t.start_date <= UTC_TIMESTAMP())
        AND (t.end_date IS NULL OR t.end_date >= UTC_TIMESTAMP())
        AND (
          t.allow_retake = 1
          OR NOT EXISTS (
            SELECT 1 FROM test_attempts a_retake
            WHERE a_retake.test_id = t.id
              AND (a_retake.student_id = ? OR a_retake.user_id = ?)
          )
        )
      LIMIT 1
    `, [TEST_ID, COURSE_ID, STUDENT_ID, STUDENT_ID]);
    console.log('\n=== INSERT_ENTITLED_TEST_ATTEMPT_SQL guard (would row match?) ===');
    console.log(JSON.stringify(insertGuard, null, 2));

    // Break down each guard clause
    const [[g1]] = await pool.query(`SELECT (? = 'published') AS published_ok`, [test.status]);
    const [[g2]] = await pool.query(`SELECT (start_date IS NULL OR start_date <= UTC_TIMESTAMP()) AS avail_start FROM tests WHERE id=?`, [TEST_ID]);
    const [[g3]] = await pool.query(`SELECT (end_date IS NULL OR end_date >= UTC_TIMESTAMP()) AS avail_end FROM tests WHERE id=?`, [TEST_ID]);
    const [[g4]] = await pool.query(`
      SELECT allow_retake,
        (allow_retake = 1 OR NOT EXISTS (
          SELECT 1 FROM test_attempts a WHERE a.test_id = ? AND (a.student_id = ? OR a.user_id = ?)
        )) AS retake_ok
      FROM tests WHERE id = ?
    `, [TEST_ID, STUDENT_ID, STUDENT_ID, TEST_ID]);
    console.log('\n=== INSERT guard breakdown ===');
    console.log(JSON.stringify({ published_ok: g1, avail_start: g2, avail_end: g3, retake: g4 }, null, 2));
  }

  // Course mismatch check - entitlement course vs test course
  const [[entitled]] = await pool.query(`
    SELECT course_id FROM enrollments WHERE user_id = ? AND access_status = 'active' ORDER BY updated_at DESC LIMIT 1
  `, [STUDENT_ID]);
  console.log('\n=== entitled course vs test course ===');
  console.log(JSON.stringify({ entitledCourseId: entitled?.course_id, testCourseId: tests[0]?.course_id, match: Number(entitled?.course_id) === Number(tests[0]?.course_id) }, null, 2));

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
