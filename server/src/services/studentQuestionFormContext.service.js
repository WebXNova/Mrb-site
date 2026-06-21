import { resolveActiveEntitlement, assertEntitlementGrantable } from './entitlement.service.js';
import { getStudentDashboard } from './studentPortal.service.js';
import { listSubjectsForCourse } from './subject.service.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Entitlement-scoped course + askable subjects for the question form.
 * Never trusts client-supplied courseId.
 */
export async function getStudentQuestionFormContext(studentId) {
  const uid = Number(studentId);
  if (!uid) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const entitlement = await resolveActiveEntitlement(uid);
  if (!entitlement?.courseId) {
    throw new ApiError(403, 'Active course enrollment required', { code: 'ENTITLEMENT_REQUIRED' });
  }
  assertEntitlementGrantable(entitlement, { userId: uid, courseId: entitlement.courseId });

  const dashboard = await getStudentDashboard(uid);
  const course = dashboard?.course ?? dashboard?.courses?.[0] ?? null;
  if (!course?.id) {
    throw new ApiError(403, 'Active course enrollment required', { code: 'ENTITLEMENT_REQUIRED' });
  }

  const subjects = await listSubjectsForCourse(Number(entitlement.courseId), { includeInactive: false });

  return {
    course: {
      id: Number(course.id),
      title: course.title ?? course.name ?? `Course #${course.id}`,
    },
    subjects: subjects.map((row) => ({
      id: Number(row.id),
      title: String(row.title || '').trim(),
      orderIndex: Number(row.orderIndex ?? 0),
    })),
  };
}
