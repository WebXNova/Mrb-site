import { mysqlPool } from '../config/mysql.js';

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function listUsers() {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, status, created_at
     FROM users
     ORDER BY created_at DESC`
  );

  if (!rows.length) return [];

  const userIds = rows.map((row) => Number(row.id));
  const placeholders = userIds.map(() => '?').join(',');
  const [authRows] = await mysqlPool.query(
    `SELECT user_id, action, metadata_json, created_at
     FROM activity_logs
     WHERE user_id IN (${placeholders})
       AND action IN ('student.register', 'student.login')
     ORDER BY created_at DESC`,
    userIds
  );

  const authMetaByUserId = new Map();
  for (const entry of authRows) {
    const userId = Number(entry.user_id);
    const existing = authMetaByUserId.get(userId) || {
      registeredAt: null,
      registeredIpAddress: null,
      registeredUserAgent: null,
      lastLoginAt: null,
      lastLoginIpAddress: null,
      lastLoginUserAgent: null,
      loginCount: 0,
    };
    const metadata = parseMetadata(entry.metadata_json);

    if (entry.action === 'student.register' && !existing.registeredAt) {
      existing.registeredAt = toIsoOrNull(entry.created_at);
      existing.registeredIpAddress = metadata.ipAddress || null;
      existing.registeredUserAgent = metadata.userAgent || null;
    }

    if (entry.action === 'student.login') {
      existing.loginCount += 1;
      if (!existing.lastLoginAt) {
        existing.lastLoginAt = toIsoOrNull(entry.created_at);
        existing.lastLoginIpAddress = metadata.ipAddress || null;
        existing.lastLoginUserAgent = metadata.userAgent || null;
      }
    }

    authMetaByUserId.set(userId, existing);
  }

  return rows.map((row) => {
    const authMeta = authMetaByUserId.get(Number(row.id)) || {};
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      registeredAt: authMeta.registeredAt || toIsoOrNull(row.created_at),
      registeredIpAddress: authMeta.registeredIpAddress || null,
      registeredUserAgent: authMeta.registeredUserAgent || null,
      lastLoginAt: authMeta.lastLoginAt || null,
      lastLoginIpAddress: authMeta.lastLoginIpAddress || null,
      lastLoginUserAgent: authMeta.lastLoginUserAgent || null,
      loginCount: authMeta.loginCount || 0,
    };
  });
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
  // Panel admin accounts — keep IN list aligned with `src/utils/isAdminRole.js`.
  const [[adminsCount]] = await mysqlPool.query(
    `SELECT COUNT(*) AS value FROM users WHERE role IN ('admin', 'super_admin')`
  );
  return {
    totalUsers: usersCount.value || 0,
    totalStudents: studentsCount.value || 0,
    totalTeachers: teachersCount.value || 0,
    totalAdmins: adminsCount.value || 0,
    totalCourses: coursesCount.value || 0,
    totalLectures: lecturesCount.value || 0,
    totalTests: testsCount.value || 0,
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
    `SELECT id, email, username, full_name, role, status, created_at
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
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}
