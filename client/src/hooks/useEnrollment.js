import { useCallback, useEffect, useMemo, useState } from 'react';
import { enrollmentApi } from '../api/enrollmentApi';
import { ENROLLMENT_BUTTON_STATE } from '../course/courseEnrollmentCta';
import { getStudentToken } from '../auth/session';
import { getUserFacingErrorMessage, isEnrollmentClosedError } from '../utils/errorHandler';

const stateCache = new Map();

/**
 * Authoritative enrollment + admission state for a course.
 * Existing enrolled students receive continue_learning even when admissions are CLOSED.
 *
 * @param {string|number|null|undefined} courseId
 */
export function useEnrollment(courseId) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const id = Number(String(courseId || '').trim());
    if (!Number.isInteger(id) || id <= 0) {
      setState(null);
      setError(null);
      return null;
    }

    if (!getStudentToken()) {
      setState(null);
      setError(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await enrollmentApi.getState(id);
      const next = response?.data ?? null;
      if (next) stateCache.set(String(id), next);
      setState(next);
      return next;
    } catch (err) {
      setError(err);
      setState(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    const cached = stateCache.get(String(courseId));
    if (cached) {
      setState(cached);
    }
    refresh();
  }, [courseId, refresh]);

  const derived = useMemo(() => {
    const buttonState = state?.buttonState ?? null;
    return {
      admissionStatus: state?.admissionStatus ?? null,
      isEnrollmentOpen: state?.isEnrollmentOpen ?? null,
      enrollmentMessage: state?.message ?? null,
      isEnrolled: Boolean(state?.isEnrolled),
      isAdmissionsClosed: Boolean(state?.admissionsClosed),
      canContinueLearning: buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING,
      canEnroll: Boolean(state?.canEnroll),
      buttonState,
      startDate: state?.startDate ?? null,
      endDate: state?.endDate ?? null,
      errorMessage: error ? getUserFacingErrorMessage(error) : null,
      isEnrollmentClosedError: isEnrollmentClosedError(error),
    };
  }, [state, error]);

  return {
    state,
    loading,
    error,
    refresh,
    ...derived,
  };
}

/**
 * Batch prefetch enrollment states for catalog cards.
 * @param {Array<string|number>} courseIds
 */
export async function prefetchEnrollmentStates(courseIds) {
  if (!getStudentToken() || !Array.isArray(courseIds) || courseIds.length === 0) {
    return {};
  }

  const results = await Promise.all(
    courseIds.map(async (courseId) => {
      const id = Number(String(courseId || '').trim());
      if (!Number.isInteger(id) || id <= 0) return [String(courseId), null];
      try {
        const response = await enrollmentApi.getState(id);
        const data = response?.data ?? null;
        if (data) stateCache.set(String(id), data);
        return [String(id), data];
      } catch {
        return [String(id), null];
      }
    })
  );

  return Object.fromEntries(results);
}

export function clearEnrollmentStateCache() {
  stateCache.clear();
}
