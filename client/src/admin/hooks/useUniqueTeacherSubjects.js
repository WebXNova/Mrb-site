import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/adminApi';

/** Minimum subject count before showing inline search. */
export const SUBJECT_SEARCH_THRESHOLD = 6;

/**
 * Load unique active subjects from the central subjects table (deduplicated by title).
 */
export function useUniqueTeacherSubjects(token) {
  const [subjects, setSubjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const response = await adminApi.uniqueActiveSubjects(token);
        const rows = Array.isArray(response?.data) ? response.data : [];
        if (!cancelled) {
          setSubjects(
            rows.map((subject) => ({
              id: Number(subject.id),
              title: String(subject.title || '').trim(),
              titleKey: String(subject.titleKey || subject.title_key || '').trim().toLowerCase(),
              relatedSubjectIds: Array.isArray(subject.relatedSubjectIds || subject.related_subject_ids)
                ? (subject.relatedSubjectIds || subject.related_subject_ids).map((id) => Number(id))
                : [Number(subject.id)],
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load subjects. Please try again.');
          setSubjects([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const subjectById = useMemo(() => {
    const map = new Map();
    subjects.forEach((subject) => map.set(subject.id, subject));
    return map;
  }, [subjects]);

  return { subjects, subjectById, isLoading, error };
}

/**
 * Validate selected unique subject ids against the loaded catalog.
 */
export function validateSelectedSubjectIds(selectedIds, subjects) {
  const uniqueSelected = [...new Set((selectedIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  if (!uniqueSelected.length) {
    return { valid: false, error: 'Please assign at least one subject to the teacher.', ids: [] };
  }

  const invalid = uniqueSelected.filter((id) => !subjects.some((subject) => subject.id === id));
  if (invalid.length) {
    return {
      valid: false,
      error: 'One or more selected subjects are no longer available. Please refresh and try again.',
      ids: [],
    };
  }

  return { valid: true, error: '', ids: uniqueSelected };
}
