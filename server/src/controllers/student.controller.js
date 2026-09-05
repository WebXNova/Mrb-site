import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { getStudentDashboard, getStudentLectures, getStudentMyCourse, getStudentResultByAttempt } from '../services/studentPortal.service.js';
import { listAuthSessionsForUser } from '../services/authSession.service.js';
import { resolveActiveEntitlement } from '../services/entitlement.service.js';
import { mysqlPool } from '../config/mysql.js';
import { mapEnrollmentAccessDisplay } from '../dto/enrollmentAccessDisplay.dto.js';
import { EnrollmentNotFoundError, MultipleActiveEnrollmentsError } from '../errors/entitlement/EntitlementErrors.js';
import { resolveRequestEntitlement } from '../security/cee/requireEntitlement.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

export const getStudentEnrollmentStatus = asyncHandler(async (req, res) => {
  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  try {
    const entitlement = await resolveActiveEntitlement(studentId);
    if (entitlement) {
      const [finishedRows] = await mysqlPool.query(
        `SELECT finished_at FROM courses WHERE id = ? LIMIT 1`,
        [entitlement.courseId]
      );
      const display = mapEnrollmentAccessDisplay({
        accessStatus: entitlement.accessStatus,
        enrollmentStatus: entitlement.enrollmentStatus,
        courseFinishedAt: finishedRows[0]?.finished_at ?? null,
      });
      sendSuccess(res, {
        enrolled: true,
        hasActiveAccess: true,
        courseId: entitlement.courseId ?? null,
        enrollmentId: entitlement.enrollmentId ?? null,
        accessStatus: entitlement.accessStatus ?? null,
        enrollmentStatus: entitlement.enrollmentStatus ?? null,
        ...display,
      });
      return;
    }

    const [rows] = await mysqlPool.query(
      `SELECT e.id, e.course_id, e.access_status, e.status, c.finished_at
       FROM enrollments e
       INNER JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = ?
       ORDER BY e.updated_at DESC, e.id DESC
       LIMIT 1`,
      [studentId]
    );
    const latest = rows[0];
    const display = mapEnrollmentAccessDisplay({
      accessStatus: latest?.access_status,
      enrollmentStatus: latest?.status,
      courseFinishedAt: latest?.finished_at,
    });
    sendSuccess(res, {
      enrolled: false,
      hasActiveAccess: false,
      courseId: latest ? Number(latest.course_id) : null,
      enrollmentId: latest ? Number(latest.id) : null,
      accessStatus: latest?.access_status ?? null,
      enrollmentStatus: latest?.status ?? null,
      ...display,
    });
  } catch (error) {
    if (error instanceof MultipleActiveEnrollmentsError) {
      sendSuccess(res, {
        enrolled: false,
        hasActiveAccess: false,
        courseId: null,
        enrollmentId: null,
        reason: 'MULTIPLE_ACTIVE_ENROLLMENTS',
      });
      return;
    }
    throw error;
  }
});

export const getStudentDashboardData = asyncHandler(async (req, res) => {
  try {
    const data = await getStudentDashboard(req.user.id);
    sendSuccess(res, data);
  } catch (error) {
    if (error instanceof EnrollmentNotFoundError) {
      sendSuccess(res, {
        entitlement: null,
        courses: [],
        course: null,
        lectures: [],
        tests: [],
        results: [],
        questionsAsked: 0,
        progress: { percent: 0, lecturesCompleted: 0, testsCompleted: 0 },
        progressPercent: 0,
        testsCompleted: 0,
        lecturesCompleted: 0,
        averageTestScore: null,
        streak: null,
        recentActivity: [],
        notifications: [],
      });
      return;
    }
    throw error;
  }
});

/** Full lecture catalog for the player (includes youtube URLs). */
export const getStudentLecturesData = asyncHandler(async (req, res) => {
  try {
    const data = await getStudentLectures(req.user.id);
    sendSuccess(res, data);
  } catch (error) {
    if (error instanceof EnrollmentNotFoundError) {
      sendSuccess(res, { lectures: [], progress: { percent: 0, lecturesCompleted: 0, testsCompleted: 0 } });
      return;
    }
    throw error;
  }
});

/** Placeholder until notification delivery is implemented — keeps client contracts stable. */
export const getStudentNotifications = asyncHandler(async (_req, res) => {
  sendSuccess(res, { notifications: [] });
});

export const getStudentMyCourseData = asyncHandler(async (req, res) => {
  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const entitlement = resolveRequestEntitlement(req);
  if (!entitlement?.courseId) {
    throw new ApiError(403, 'No active enrollment was found for your account.', {
      code: 'ENROLLMENT_NOT_FOUND',
    });
  }

  const data = await getStudentMyCourse(studentId);
  if (Number(data?.entitlement?.courseId) !== Number(entitlement.courseId)) {
    throw new ApiError(403, 'Course access mismatch.', { code: 'COURSE_ACCESS_MISMATCH' });
  }

  sendSuccess(res, data);
});

export const getStudentSessions = asyncHandler(async (req, res) => {
  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const currentSessionId = req.user?.sid ? String(req.user.sid) : null;
  const sessions = await listAuthSessionsForUser(studentId);

  sendSuccess(res, {
    sessions: sessions.map((session) => ({
      ...session,
      isCurrent: currentSessionId != null && session.id === currentSessionId,
    })),
  });
});

export const getStudentResultDetail = asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  if (!attemptId) throw new ApiError(400, 'Invalid attempt id');
  const courseId = Number(req.cee?.courseId ?? req.entitlement?.courseId);
  if (!courseId) throw new ApiError(403, 'Course entitlement required');
  const data = await getStudentResultByAttempt(req.user.id, attemptId, courseId);
  if (!data) throw new ApiError(404, 'Result not found');
  sendSuccess(res, data);
});
