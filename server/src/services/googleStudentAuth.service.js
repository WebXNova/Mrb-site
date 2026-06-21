import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { createAuthSessionTokens, deleteAuthSessionsForUser } from './authSession.service.js';
import { logOAuthAccountEvent } from './authSecurity.service.js';

const OAUTH_PROVIDER = 'google';

const RESERVED_USERNAMES = new Set(['admin', 'support', 'root', 'system']);

function normalizeUsernameBase(email) {
  const local = String(email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
  if (local.length >= 3 && local.length <= 30 && !RESERVED_USERNAMES.has(local)) {
    return local;
  }
  return 'student';
}

async function allocateUniqueUsername(email) {
  const base = normalizeUsernameBase(email);
  let candidate = base.slice(0, 30);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const [rows] = await mysqlPool.query(`SELECT id FROM users WHERE username = ? LIMIT 1`, [candidate]);
    if (!rows[0]) return candidate;
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const trimmedBase = base.slice(0, Math.max(3, 30 - suffix.length - 1));
    candidate = `${trimmedBase}${trimmedBase.endsWith('.') ? '' : '.'}${suffix}`.slice(0, 30);
  }
  throw new ApiError(500, 'Could not allocate username');
}

async function fetchStudentRowByGoogleSub(googleSub) {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, status, token_version, is_verified, avatar_url
       FROM users
      WHERE google_sub = ? AND role = 'student'
      LIMIT 1`,
    [googleSub]
  );
  return rows[0] || null;
}

async function fetchUserByEmail(email) {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, status, token_version, is_verified, google_sub, avatar_url
       FROM users
      WHERE email = ?
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function fetchStudentById(userId) {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, status, token_version, is_verified, avatar_url
       FROM users
      WHERE id = ? AND role = 'student'
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

function toStudentPayload(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    isVerified: Boolean(row.is_verified),
    avatarUrl: row.avatar_url || null,
  };
}

async function issueStudentSession(studentRow, authContext = {}) {
  if (studentRow.status !== 'active') {
    throw new ApiError(403, 'Student account is suspended');
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await deleteAuthSessionsForUser(studentRow.id, connection);
    const { accessToken, refreshToken } = await createAuthSessionTokens(
      {
        userId: studentRow.id,
        role: studentRow.role,
        roleSnapshot: 'student',
        tokenVersion: studentRow.token_version,
        email: studentRow.email,
        fullName: studentRow.full_name,
        clientIp: authContext.clientIp || null,
        userAgent: authContext.userAgent || null,
      },
      connection
    );
    await connection.commit();
    return {
      student: toStudentPayload(studentRow),
      accessToken,
      refreshToken,
      isNewUser: Boolean(authContext.isNewUser),
      linkedExistingAccount: Boolean(authContext.linkedExistingAccount),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function linkGoogleProfile(userId, profile) {
  const [result] = await mysqlPool.query(
    `UPDATE users
        SET google_sub = ?,
            avatar_url = COALESCE(?, avatar_url),
            full_name = CASE WHEN TRIM(full_name) = '' THEN ? ELSE full_name END,
            is_verified = TRUE,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND role = 'student'`,
    [profile.sub, profile.picture, profile.name, userId]
  );
  if (!result?.affectedRows) {
    // Defensive invariant: linking must never modify a non-student account.
    throw new ApiError(403, 'Google sign-in role invariant violated');
  }
}

async function createGoogleStudent(profile) {
  const username = await allocateUniqueUsername(profile.email);
  const [result] = await mysqlPool.query(
    `INSERT INTO users (email, username, password_hash, google_sub, full_name, avatar_url, role, status, is_verified)
     VALUES (?, ?, NULL, ?, ?, ?, 'student', 'active', TRUE)`,
    [profile.email, username, profile.sub, profile.name, profile.picture]
  );
  const student = await fetchStudentById(result.insertId);
  if (!student) throw new ApiError(500, 'Could not create student account');
  return student;
}

/**
 * Sign in or register a student using a verified Google ID token payload.
 */
export async function loginOrRegisterStudentWithGoogle(profile, authContext = {}) {
  const auditBase = {
    provider: OAUTH_PROVIDER,
    providerAccountId: profile.sub,
    clientIp: authContext.clientIp || null,
    userAgent: authContext.userAgent || null,
    role: 'student',
  };

  let student = await fetchStudentRowByGoogleSub(profile.sub);
  let linkedExistingAccount = false;

  if (student) {
    await logOAuthAccountEvent({
      ...auditBase,
      userId: student.id,
      action: 'auth.oauth.login',
      metadata: { flow: 'provider_account_match' },
    });
  }

  if (!student) {
    const existing = await fetchUserByEmail(profile.email);
    if (existing) {
      if (existing.role !== 'student') {
        await logOAuthAccountEvent({
          ...auditBase,
          userId: existing.id,
          action: 'auth.oauth.conflict',
          metadata: { reason: 'staff_role_rejected', existingRole: existing.role },
        });
        throw new ApiError(
          403,
          'This Google account cannot be used for student sign-in. Use email and password for staff accounts.'
        );
      }
      if (existing.google_sub && existing.google_sub !== profile.sub) {
        await logOAuthAccountEvent({
          ...auditBase,
          userId: existing.id,
          action: 'auth.oauth.conflict',
          metadata: { reason: 'email_linked_to_different_provider_account' },
        });
        throw new ApiError(409, 'This email is linked to a different Google account');
      }
      await linkGoogleProfile(existing.id, profile);
      student = await fetchStudentById(existing.id);
      linkedExistingAccount = true;
      if (student) {
        await logOAuthAccountEvent({
          ...auditBase,
          userId: student.id,
          action: 'auth.oauth.linked',
          metadata: { flow: 'email_match_link' },
        });
      }
    }
  }

  let isNewUser = false;
  if (!student) {
    student = await createGoogleStudent(profile);
    isNewUser = true;
    await logOAuthAccountEvent({
      ...auditBase,
      userId: student.id,
      action: 'auth.oauth.register',
      metadata: { flow: 'new_user_created' },
    });
  } else if (profile.picture && profile.picture !== student.avatar_url) {
    const [result] = await mysqlPool.query(
      `UPDATE users
         SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND role = 'student'`,
      [profile.picture, student.id]
    );
    if (!result?.affectedRows) {
      // Defensive invariant: only student rows can receive Google profile enrichment.
      throw new ApiError(403, 'Google sign-in role invariant violated');
    }
    student.avatar_url = profile.picture;
  }

  return issueStudentSession(student, { ...authContext, isNewUser, linkedExistingAccount });
}
