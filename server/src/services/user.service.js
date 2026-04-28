import { mysqlPool } from '../config/mysql.js';

export async function listUsers() {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, full_name, role, status, created_at
     FROM users
     ORDER BY created_at DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function dashboardStats() {
  const [[usersCount]] = await mysqlPool.query(`SELECT COUNT(*) AS value FROM users`);
  const [[coursesCount]] = await mysqlPool.query(`SELECT COUNT(*) AS value FROM courses`);
  const [[lecturesCount]] = await mysqlPool.query(`SELECT COUNT(*) AS value FROM lectures`);
  const [[testsCount]] = await mysqlPool.query(`SELECT COUNT(*) AS value FROM tests`);
  const [[studentsCount]] = await mysqlPool.query(
    `SELECT COUNT(*) AS value FROM users WHERE role = 'student'`
  );
  const [[teachersCount]] = await mysqlPool.query(
    `SELECT COUNT(*) AS value FROM users WHERE role = 'teacher'`
  );
  const [[adminsCount]] = await mysqlPool.query(
    `SELECT COUNT(*) AS value FROM users WHERE role IN ('admin', 'super_admin')`
  );
  const [[codesCount]] = await mysqlPool.query(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN is_used = FALSE THEN 1 ELSE 0 END) AS available FROM mrb_codes`
  );

  return {
    totalUsers: usersCount.value || 0,
    totalStudents: studentsCount.value || 0,
    totalTeachers: teachersCount.value || 0,
    totalAdmins: adminsCount.value || 0,
    totalCourses: coursesCount.value || 0,
    totalLectures: lecturesCount.value || 0,
    totalTests: testsCount.value || 0,
    availableCodes: codesCount.available || 0,
    totalCodes: codesCount.total || 0,
  };
}

export async function updateUserStatus(userId, status) {
  await mysqlPool.query(
    `UPDATE users
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, userId]
  );
  const [rows] = await mysqlPool.query(
    `SELECT id, email, full_name, role, status, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}
