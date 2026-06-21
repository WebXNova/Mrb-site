import bcrypt from 'bcryptjs';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { toTeacherAdminDto } from '../dto/teacher.dto.js';
import { deleteAuthSessionsForUser } from './authSession.service.js';
import { isTeacherActivationStatus, isTeacherOperationalStatus } from '../utils/teacherStatus.js';
import {
  expandSubjectIdsForTeacherAssignment,
  listUniqueSubjectTitlesForTeacher,
  mapSubjectIdsToUniqueCanonicalIds,
} from './subject.service.js';

/** Strong work factor — matches admin bootstrap script (create-admin.js). */
const BCRYPT_ROUNDS = 12;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function mapDuplicateEntryError(error) {
  if (error?.code !== 'ER_DUP_ENTRY') return null;
  const message = String(error.message || '');
  if (message.includes('username')) {
    return new ApiError(409, 'Username already in use', { code: 'USERNAME_ALREADY_IN_USE' });
  }
  if (message.includes('email')) {
    return new ApiError(409, 'Email already in use', { code: 'EMAIL_ALREADY_IN_USE' });
  }
  if (message.includes('teacher_subjects')) {
    return new ApiError(409, 'Duplicate subject assignment', { code: 'DUPLICATE_SUBJECT_ASSIGNMENT' });
  }
  return new ApiError(409, 'Resource already exists', { code: 'DUPLICATE_ENTRY' });
}

async function assertEmailAvailable(email, connection, excludeUserId = null) {
  const excludeId = excludeUserId != null ? Number(excludeUserId) : null;
  const [rows] = await connection.query(
    excludeId
      ? `SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`
      : `SELECT id FROM users WHERE email = ? LIMIT 1`,
    excludeId ? [email, excludeId] : [email]
  );
  if (rows[0]) {
    throw new ApiError(409, 'Email already in use', { code: 'EMAIL_ALREADY_IN_USE' });
  }
}

async function assertUsernameAvailable(username, connection, excludeUserId = null) {
  const excludeId = excludeUserId != null ? Number(excludeUserId) : null;
  const [rows] = await connection.query(
    excludeId
      ? `SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1`
      : `SELECT id FROM users WHERE username = ? LIMIT 1`,
    excludeId ? [username, excludeId] : [username]
  );
  if (rows[0]) {
    throw new ApiError(409, 'Username already in use', { code: 'USERNAME_ALREADY_IN_USE' });
  }
}

/**
 * @param {number[]} subjectIds
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function assertSubjectsExistAndActive(subjectIds, connection) {
  if (!subjectIds.length) return;

  const [rows] = await connection.query(
    `SELECT id FROM subjects WHERE id IN (?) AND is_active = TRUE`,
    [subjectIds]
  );
  const found = new Set(rows.map((row) => Number(row.id)));
  const missing = subjectIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError(422, 'One or more subject IDs are invalid or inactive', {
      code: 'INVALID_SUBJECT_IDS',
      missingSubjectIds: missing,
    });
  }
}

/**
 * Create a teacher user and optional subject assignments atomically.
 *
 * @param {{
 *   fullName: string,
 *   email: string,
 *   username: string,
 *   password: string,
 *   status: 'active' | 'inactive',
 *   subjectIds?: number[],
 *   assignedBy: number,
 * }} input
 */
export async function createTeacher({
  fullName,
  email,
  username,
  password,
  status,
  subjectIds = [],
  assignedBy,
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);
  const requestedSubjectIds = [...new Set(subjectIds.map((id) => Number(id)))];

  const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    await assertEmailAvailable(normalizedEmail, connection);
    await assertUsernameAvailable(normalizedUsername, connection);

    const uniqueSubjectIds = await expandSubjectIdsForTeacherAssignment(requestedSubjectIds, connection);
    await assertSubjectsExistAndActive(uniqueSubjectIds, connection);

    const [insertResult] = await connection.query(
      `INSERT INTO users (email, username, password_hash, full_name, role, status, is_verified)
       VALUES (?, ?, ?, ?, 'teacher', ?, TRUE)`,
      [normalizedEmail, normalizedUsername, passwordHash, fullName, status]
    );
    const teacherId = Number(insertResult.insertId);

    if (uniqueSubjectIds.length > 0) {
      const assignmentRows = uniqueSubjectIds.map((subjectId) => [
        teacherId,
        subjectId,
        assignedBy,
      ]);
      await connection.query(
        `INSERT INTO teacher_subjects (teacher_id, subject_id, assigned_by) VALUES ?`,
        [assignmentRows]
      );
    }

    const [userRows] = await connection.query(
      `SELECT id, email, username, full_name, role, status, is_verified, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [teacherId]
    );

    await connection.commit();
    return toTeacherAdminDto(userRows[0], uniqueSubjectIds);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* already rolled back */
    }
    const duplicateError = mapDuplicateEntryError(error);
    if (duplicateError) throw duplicateError;
    throw error;
  } finally {
    connection.release();
  }
}

async function loadTeacherSubjectIds(teacherId, connection = mysqlPool) {
  const [rows] = await connection.query(
    `SELECT subject_id FROM teacher_subjects WHERE teacher_id = ? ORDER BY subject_id`,
    [teacherId]
  );
  return rows.map((row) => Number(row.subject_id));
}

function buildTeacherAuditSnapshot(row, subjectIds, subjectTitles = []) {
  return {
    fullName: row.full_name,
    email: row.email,
    username: row.username,
    status: row.status,
    assignedSubjectIds: [...subjectIds],
    assignedSubjectTitles: [...subjectTitles],
  };
}

/**
 * Sync teacher_subjects to match target ids exactly (add/remove diff).
 */
async function syncTeacherSubjectAssignments(teacherId, targetSubjectIds, assignedBy, connection) {
  const tid = Number(teacherId);
  const targetSet = new Set(
    [...new Set((targetSubjectIds || []).map((id) => Number(id)).filter((id) => id > 0))].sort((a, b) => a - b)
  );
  const currentIds = await loadTeacherSubjectIds(tid, connection);
  const currentSet = new Set(currentIds);

  const toRemove = currentIds.filter((id) => !targetSet.has(id));
  const toAdd = [...targetSet].filter((id) => !currentSet.has(id));

  if (toRemove.length) {
    await connection.query(`DELETE FROM teacher_subjects WHERE teacher_id = ? AND subject_id IN (?)`, [
      tid,
      toRemove,
    ]);
  }

  if (toAdd.length) {
    const assignmentRows = toAdd.map((subjectId) => [tid, subjectId, assignedBy]);
    await connection.query(`INSERT INTO teacher_subjects (teacher_id, subject_id, assigned_by) VALUES ?`, [
      assignmentRows,
    ]);
  }

  return { added: toAdd, removed: toRemove };
}

/**
 * Atomically update teacher profile, status, optional password, and subject assignments.
 */
export async function updateTeacher(
  teacherId,
  { fullName, email, username, status, subjectIds = [], password, updatedBy }
) {
  const tid = Number(teacherId);
  if (!tid) {
    throw new ApiError(400, 'Invalid teacher id', { code: 'INVALID_TEACHER_ID' });
  }
  if (!isTeacherActivationStatus(status)) {
    throw new ApiError(422, 'Teacher status must be active or inactive', { code: 'INVALID_TEACHER_STATUS' });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);
  const requestedSubjectIds = [...new Set(subjectIds.map((id) => Number(id)))];
  const passwordProvided = typeof password === 'string' && password.length > 0;

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, email, username, full_name, role, status, is_verified, created_at, updated_at
       FROM users WHERE id = ? AND role = 'teacher' LIMIT 1 FOR UPDATE`,
      [tid]
    );
    if (!rows[0]) {
      await connection.rollback();
      throw new ApiError(404, 'Teacher not found', { code: 'TEACHER_NOT_FOUND' });
    }

    const previousSubjectIds = await loadTeacherSubjectIds(tid, connection);
    const previousSubjectTitles = await listUniqueSubjectTitlesForTeacher(tid, connection);
    const previousSnapshot = buildTeacherAuditSnapshot(rows[0], previousSubjectIds, previousSubjectTitles);

    await assertEmailAvailable(normalizedEmail, connection, tid);
    await assertUsernameAvailable(normalizedUsername, connection, tid);

    const expandedSubjectIds = await expandSubjectIdsForTeacherAssignment(requestedSubjectIds, connection);
    await assertSubjectsExistAndActive(expandedSubjectIds, connection);

    const previousStatus = rows[0].status;
    const statusChanged = previousStatus !== status;
    const bumpTokenVersion =
      passwordProvided || (statusChanged && status === 'inactive');

    let passwordHash = null;
    if (passwordProvided) {
      passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    }

    if (passwordHash) {
      await connection.query(
        `UPDATE users
         SET email = ?, username = ?, full_name = ?, status = ?, password_hash = ?,
             token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND role = 'teacher'`,
        [normalizedEmail, normalizedUsername, fullName, status, passwordHash, tid]
      );
    } else if (statusChanged) {
      await connection.query(
        `UPDATE users
         SET email = ?, username = ?, full_name = ?, status = ?,
             token_version = token_version + ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND role = 'teacher'`,
        [normalizedEmail, normalizedUsername, fullName, status, status === 'inactive' ? 1 : 0, tid]
      );
    } else {
      await connection.query(
        `UPDATE users
         SET email = ?, username = ?, full_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND role = 'teacher'`,
        [normalizedEmail, normalizedUsername, fullName, status, tid]
      );
    }

    const subjectSync = await syncTeacherSubjectAssignments(tid, expandedSubjectIds, updatedBy, connection);

    if (passwordProvided || (statusChanged && status === 'inactive')) {
      await deleteAuthSessionsForUser(tid, connection);
    }

    const finalSubjectIds = await loadTeacherSubjectIds(tid, connection);
    const finalSubjectTitles = await listUniqueSubjectTitlesForTeacher(tid, connection);
    const assignedUniqueSubjectIds = await mapSubjectIdsToUniqueCanonicalIds(finalSubjectIds);

    const [updatedRows] = await connection.query(
      `SELECT id, email, username, full_name, role, status, is_verified, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [tid]
    );

    const nextSnapshot = buildTeacherAuditSnapshot(updatedRows[0], finalSubjectIds, finalSubjectTitles);

    const changedFields = [];
    if (previousSnapshot.fullName !== nextSnapshot.fullName) changedFields.push('fullName');
    if (previousSnapshot.email !== nextSnapshot.email) changedFields.push('email');
    if (previousSnapshot.username !== nextSnapshot.username) changedFields.push('username');
    if (previousSnapshot.status !== nextSnapshot.status) changedFields.push('status');
    if (passwordProvided) changedFields.push('password');
    if (
      JSON.stringify([...previousSnapshot.assignedSubjectIds].sort()) !==
      JSON.stringify([...nextSnapshot.assignedSubjectIds].sort())
    ) {
      changedFields.push('assignedSubjects');
    }

    await connection.commit();

    return {
      teacher: {
        ...toTeacherAdminDto(updatedRows[0], finalSubjectIds),
        assignedUniqueSubjectIds,
        assignedSubjectTitles: finalSubjectTitles,
      },
      changed: changedFields.length > 0,
      changedFields,
      passwordChanged: passwordProvided,
      previous: previousSnapshot,
      next: nextSnapshot,
      subjectIdsAdded: subjectSync.added,
      subjectIdsRemoved: subjectSync.removed,
      updatedBy,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* already rolled back */
    }
    const duplicateError = mapDuplicateEntryError(error);
    if (duplicateError) throw duplicateError;
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update teacher activation status (soft-status; never deletes records).
 *
 * @param {number} teacherId
 * @param {{
 *   status: 'active' | 'inactive',
 *   changedBy: number,
 *   reason?: string,
 * }} input
 */
export async function updateTeacherActivationStatus(teacherId, { status, changedBy, reason = null }) {
  const tid = Number(teacherId);
  if (!tid) {
    throw new ApiError(400, 'Invalid teacher id', { code: 'INVALID_TEACHER_ID' });
  }
  if (!isTeacherActivationStatus(status)) {
    throw new ApiError(422, 'Teacher status must be active or inactive', { code: 'INVALID_TEACHER_STATUS' });
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, email, username, full_name, role, status, is_verified, created_at, updated_at
       FROM users WHERE id = ? AND role = 'teacher' LIMIT 1 FOR UPDATE`,
      [tid]
    );
    if (!rows[0]) {
      await connection.rollback();
      throw new ApiError(404, 'Teacher not found', { code: 'TEACHER_NOT_FOUND' });
    }

    const previousStatus = rows[0].status;
    const subjectIds = await loadTeacherSubjectIds(tid, connection);

    if (previousStatus === status) {
      await connection.commit();
      return {
        teacher: toTeacherAdminDto(rows[0], subjectIds),
        previousStatus,
        status,
        changed: false,
      };
    }

    const bumpTokenVersion = status === 'inactive';
    await connection.query(
      `UPDATE users
       SET status = ?,
           token_version = token_version + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, bumpTokenVersion ? 1 : 0, tid]
    );

    if (status === 'inactive') {
      await deleteAuthSessionsForUser(tid, connection);
    }

    const [updatedRows] = await connection.query(
      `SELECT id, email, username, full_name, role, status, is_verified, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [tid]
    );

    await connection.commit();

    return {
      teacher: toTeacherAdminDto(updatedRows[0], subjectIds),
      previousStatus,
      status,
      changed: true,
      reason: reason ?? null,
      changedBy,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* already rolled back */
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Active teachers assigned to a subject — admin/listing only.
 * Student question routing must use assignTeacherForStudentQuestion().
 * @param {number} subjectId
 */
export async function listOperationalTeachersForSubject(subjectId) {
  const sid = Number(subjectId);
  if (!sid) return [];

  const [rows] = await mysqlPool.query(
    `SELECT u.id, u.email, u.username, u.full_name, u.status
     FROM teacher_subjects ts
     INNER JOIN users u ON u.id = ts.teacher_id
     WHERE ts.subject_id = ?
       AND u.role = 'teacher'
       AND u.status = 'active'
     ORDER BY u.full_name, u.id`,
    [sid]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    status: row.status,
  }));
}

/**
 * Assert a teacher is active before assigning work (questions, etc.).
 * @param {number} teacherId
 */
export async function assertTeacherIsOperational(teacherId) {
  const tid = Number(teacherId);
  if (!tid) {
    throw new ApiError(400, 'Invalid teacher id', { code: 'INVALID_TEACHER_ID' });
  }

  const [rows] = await mysqlPool.query(
    `SELECT id, status, role FROM users WHERE id = ? AND role = 'teacher' LIMIT 1`,
    [tid]
  );
  if (!rows[0]) {
    throw new ApiError(404, 'Teacher not found', { code: 'TEACHER_NOT_FOUND' });
  }
  if (!isTeacherOperationalStatus(rows[0].status)) {
    throw new ApiError(403, 'Teacher account is inactive and cannot receive questions', {
      code: 'TEACHER_INACTIVE',
    });
  }
  return rows[0];
}

/**
 * Admin teacher detail with deduplicated subject assignment ids for the edit form.
 */
/**
 * Self-service teacher profile — always keyed by authenticated session user id.
 * Never accepts a client-supplied teacher id (IDOR-safe).
 */
export async function getTeacherProfileForSelf(sessionUserId) {
  const userId = Number(sessionUserId);
  if (!userId) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, status
     FROM users WHERE id = ? AND role = 'teacher' LIMIT 1`,
    [userId]
  );
  if (!rows[0]) {
    throw new ApiError(404, 'Teacher not found', { code: 'TEACHER_NOT_FOUND' });
  }

  const assignedSubjectTitles = await listUniqueSubjectTitlesForTeacher(userId);

  return {
    id: Number(rows[0].id),
    fullName: rows[0].full_name,
    email: rows[0].email,
    username: rows[0].username,
    status: rows[0].status,
    assignedSubjectTitles,
  };
}

export async function getTeacherForAdmin(teacherId) {
  const tid = Number(teacherId);
  if (!tid) {
    throw new ApiError(400, 'Invalid teacher id', { code: 'INVALID_TEACHER_ID' });
  }

  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, status, is_verified, created_at, updated_at
     FROM users WHERE id = ? AND role = 'teacher' LIMIT 1`,
    [tid]
  );
  if (!rows[0]) {
    throw new ApiError(404, 'Teacher not found', { code: 'TEACHER_NOT_FOUND' });
  }

  const assignedSubjectIds = await loadTeacherSubjectIds(tid);
  const assignedUniqueSubjectIds = await mapSubjectIdsToUniqueCanonicalIds(assignedSubjectIds);
  const assignedSubjectTitles = await listUniqueSubjectTitlesForTeacher(tid);

  return {
    ...toTeacherAdminDto(rows[0], assignedSubjectIds),
    assignedUniqueSubjectIds,
    assignedSubjectTitles,
  };
}

/**
 * Admin teacher list with unique assigned subject titles.
 */
export async function listTeachersForAdmin() {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, status, is_verified, created_at, updated_at
     FROM users
     WHERE role = 'teacher'
     ORDER BY created_at DESC`
  );

  const teachers = await Promise.all(
    rows.map(async (row) => {
      const assignedSubjectIds = await loadTeacherSubjectIds(Number(row.id));
      const assignedSubjectTitles = await listUniqueSubjectTitlesForTeacher(Number(row.id));
      return {
        ...toTeacherAdminDto(row, assignedSubjectIds),
        assignedSubjectTitles,
      };
    })
  );

  return teachers;
}

