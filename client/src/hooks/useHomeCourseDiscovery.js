import { useEffect, useMemo, useState } from 'react';
import { getStudentToken } from '../auth/session';
import { usePublicCatalogCourses } from './usePublicCatalogCourses';
import { useStudentCourseEnrollments } from './useStudentCourseEnrollments';
import { prefetchEnrollmentStates } from './useEnrollment';
import {
  filterDiscoverableCourses,
  getActiveEnrollment,
  pickFeaturedCourse,
  resolveHomeCourseSectionCopy,
  studentHasActivePremiumCourse,
} from '../course/courseDiscovery';

export function useHomeCourseDiscovery() {
  const isAuthenticated = Boolean(getStudentToken());
  const { courses, loading: coursesLoading, error, reload } = usePublicCatalogCourses();
  const { byCourseId, loading: enrollmentsLoading } = useStudentCourseEnrollments();
  const [statePrefetchDone, setStatePrefetchDone] = useState(!isAuthenticated);
  const [prefetchStates, setPrefetchStates] = useState([]);

  const activeEnrollment = useMemo(() => getActiveEnrollment(byCourseId), [byCourseId]);
  const hideFree = studentHasActivePremiumCourse(byCourseId, prefetchStates);
  const visibleCourses = useMemo(
    () => filterDiscoverableCourses(courses, { hideFree }),
    [courses, hideFree]
  );
  const featuredCourse = useMemo(
    () => pickFeaturedCourse(visibleCourses, { currentCourseId: activeEnrollment?.courseId }),
    [visibleCourses, activeEnrollment]
  );
  const copy = resolveHomeCourseSectionCopy({
    isAuthenticated,
    hasActiveCourse: Boolean(activeEnrollment),
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setPrefetchStates([]);
      setStatePrefetchDone(true);
      return undefined;
    }
    if (coursesLoading) return undefined;
    if (courses.length === 0) {
      setPrefetchStates([]);
      setStatePrefetchDone(true);
      return undefined;
    }

    let cancelled = false;
    setStatePrefetchDone(false);
    prefetchEnrollmentStates(courses.map((course) => course.id))
      .then((results) => {
        if (!cancelled) {
          setPrefetchStates(Object.values(results || {}).filter(Boolean));
        }
      })
      .finally(() => {
        if (!cancelled) setStatePrefetchDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, coursesLoading, courses]);

  const waitingForStudent =
    isAuthenticated && (enrollmentsLoading || (courses.length > 0 && !statePrefetchDone));

  return {
    courses: visibleCourses,
    allCourses: courses,
    featuredCourse,
    activeEnrollment,
    copy,
    hideFree,
    isAuthenticated,
    loading: coursesLoading || waitingForStudent,
    error,
    reload,
  };
}
