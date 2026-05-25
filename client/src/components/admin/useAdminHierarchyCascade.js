import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { safeAdminErrorMessage } from './adminSafeMessages';

function isAbortError(err) {
  return err?.name === 'AbortError';
}

function sortByTitle(items) {
  return [...(items ?? [])].sort((a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, { sensitivity: 'base' })
  );
}

/**
 * Lazily-loaded Course → Subject → (optional Chapter) cascade for admin panels.
 * Uses cookie-auth admin client only. Aborts stale requests on selection changes.
 *
 * @param {object} options
 * @param {string | null | undefined} options.token Admin session token (from getAdminToken())
 * @param {2 | 3} [options.depth] 2 = course+subject only; 3 includes chapter tier
 * @param {boolean} [options.subjectsIncludeInactive=false] Passed to subjects API for this cascade
 * @param {number | string} [options.chapterRefetchKey] Bump to re-fetch chapters for current subject without changing ids
 * @param {{ courses: unknown[], isLoadingCourses: boolean } | null} [options.sharedCourses=null] When set, skips fetching courses (reuse from another instance)
 * @param {(reason: 'course' | 'subject') => void} [options.onReset] After dependent state is cleared (for parent mutation/validation UX)
 */
export function useAdminHierarchyCascade({
  token,
  depth = 3,
  subjectsIncludeInactive = false,
  chapterRefetchKey = 0,
  sharedCourses = null,
  onReset,
} = {}) {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadOwnCourses = sharedCourses == null;

  const [internalCourses, setInternalCourses] = useState([]);
  const [isLoadingInternalCourses, setIsLoadingInternalCourses] = useState(true);

  const courses = loadOwnCourses ? internalCourses : (sharedCourses?.courses ?? []);
  const isLoadingCourses = loadOwnCourses ? isLoadingInternalCourses : Boolean(sharedCourses?.isLoadingCourses);

  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');

  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  const [hierarchyErrors, setHierarchyErrors] = useState({
    courseLoad: '',
    subjectLoad: '',
    chapterLoad: '',
  });

  const clearHierarchyErrors = useCallback(() => {
    setHierarchyErrors({ courseLoad: '', subjectLoad: '', chapterLoad: '' });
  }, []);

  const applyHierarchySelection = useCallback(
    (next) => {
      if (!next || typeof next !== 'object') return;
      if ('courseId' in next) {
        setSelectedCourseId(
          next.courseId != null && String(next.courseId).trim() !== '' ? String(next.courseId) : ''
        );
      }
      if ('subjectId' in next) {
        setSelectedSubjectId(
          next.subjectId != null && String(next.subjectId).trim() !== '' ? String(next.subjectId) : ''
        );
      }
      if (depth >= 3 && 'chapterId' in next) {
        setSelectedChapterId(
          next.chapterId != null && String(next.chapterId).trim() !== '' ? String(next.chapterId) : ''
        );
      }
    },
    [depth]
  );

  const selectCourse = useCallback(
    (courseId) => {
      onReset?.('course');
      setSelectedCourseId(courseId);
      setSelectedSubjectId('');
      setSelectedChapterId('');
      setSubjects([]);
      setChapters([]);
      setHierarchyErrors((prev) => ({
        ...prev,
        subjectLoad: '',
        chapterLoad: '',
      }));
    },
    [onReset]
  );

  const selectSubject = useCallback(
    (subjectId) => {
      onReset?.('subject');
      setSelectedSubjectId(subjectId);
      if (depth >= 3) {
        setSelectedChapterId('');
        setChapters([]);
        setHierarchyErrors((prev) => ({
          ...prev,
          chapterLoad: '',
        }));
      }
    },
    [depth, onReset]
  );

  const selectChapter = useCallback((chapterId) => {
    setSelectedChapterId(chapterId);
  }, []);

  /** Full selection + list reset (e.g. leave page) */
  const resetCascade = useCallback(() => {
    selectCourse('');
  }, [selectCourse]);

  useEffect(() => {
    if (!loadOwnCourses) return;

    const ac = new AbortController();
    setIsLoadingInternalCourses(true);
    setHierarchyErrors((prev) => ({ ...prev, courseLoad: '' }));

    adminApi
      .courses(token)
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        setInternalCourses(res?.data || []);
      })
      .catch((err) => {
        if (!mountedRef.current || ac.signal.aborted || isAbortError(err)) return;
        setInternalCourses([]);
        setHierarchyErrors((prev) => ({
          ...prev,
          courseLoad: safeAdminErrorMessage(err, 'Unable to load courses.'),
        }));
      })
      .finally(() => {
        if (mountedRef.current && !ac.signal.aborted) setIsLoadingInternalCourses(false);
      });

    return () => ac.abort();
  }, [token, loadOwnCourses]);

  useEffect(() => {
    if (!selectedCourseId) {
      setSubjects([]);
      setIsLoadingSubjects(false);
      return;
    }

    const ac = new AbortController();
    setIsLoadingSubjects(true);
    setHierarchyErrors((prev) => ({
      ...prev,
      subjectLoad: '',
      ...(depth >= 3 ? { chapterLoad: '' } : {}),
    }));

    adminApi
      .subjects(token, selectedCourseId, { includeInactive: subjectsIncludeInactive })
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        const list = res?.data ?? [];
        setSubjects(list);

        /** If selection is no longer in the authoritative list (e.g. archived), drop it only */
        setSelectedSubjectId((prevSid) => {
          if (!prevSid) return prevSid;
          return list.some((s) => String(s.id) === String(prevSid)) ? prevSid : '';
        });
      })
      .catch((err) => {
        if (!mountedRef.current || ac.signal.aborted || isAbortError(err)) return;
        setSubjects([]);
        setHierarchyErrors((prev) => ({
          ...prev,
          subjectLoad: safeAdminErrorMessage(err, 'Unable to load subjects.'),
        }));
      })
      .finally(() => {
        if (mountedRef.current && !ac.signal.aborted) setIsLoadingSubjects(false);
      });

    return () => ac.abort();
  }, [token, selectedCourseId, subjectsIncludeInactive, depth]);

  useEffect(() => {
    if (depth < 3) {
      setChapters([]);
      setIsLoadingChapters(false);
      return;
    }

    if (!selectedSubjectId) {
      setChapters([]);
      setSelectedChapterId('');
      setIsLoadingChapters(false);
      return;
    }

    const ac = new AbortController();
    setIsLoadingChapters(true);
    setHierarchyErrors((prev) => ({ ...prev, chapterLoad: '' }));

    adminApi
      .listChapters(token, { subjectId: selectedSubjectId }, { signal: ac.signal })
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        const list = res?.data ?? [];
        setChapters(list);
        setSelectedChapterId((prevCid) => {
          if (!prevCid) return prevCid;
          return list.some((ch) => String(ch.id) === String(prevCid)) ? prevCid : '';
        });
      })
      .catch((err) => {
        if (!mountedRef.current || ac.signal.aborted || isAbortError(err)) return;
        setChapters([]);
        const message = safeAdminErrorMessage(err, 'Unable to load chapters.');
        if (err?.status === 404) {
          setHierarchyErrors((prev) => ({
            ...prev,
            chapterLoad: 'The selected subject is no longer available.',
          }));
          setSelectedSubjectId('');
          setSelectedChapterId('');
        } else {
          setHierarchyErrors((prev) => ({
            ...prev,
            chapterLoad: message,
          }));
        }
      })
      .finally(() => {
        if (mountedRef.current && !ac.signal.aborted) setIsLoadingChapters(false);
      });

    return () => ac.abort();
  }, [token, selectedSubjectId, depth, chapterRefetchKey]);

  const sortedCourses = useMemo(() => sortByTitle(courses), [courses]);
  const sortedSubjects = useMemo(() => sortByTitle(subjects), [subjects]);
  const sortedChapters = useMemo(() => sortByTitle(chapters), [chapters]);

  return {
    selectedCourseId,
    selectedSubjectId,
    selectedChapterId,
    selectCourse,
    selectSubject,
    selectChapter,

    courses,
    subjects,
    chapters,
    sortedCourses,
    sortedSubjects,
    sortedChapters,

    isLoadingCourses,
    isLoadingSubjects,
    isLoadingChapters,

    hierarchyErrors,
    clearHierarchyErrors,
    resetCascade,
    applyHierarchySelection,
  };
}
