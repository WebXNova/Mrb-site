import { useEffect, useState } from 'react';
import { catalogApi } from '../api/catalogApi';
import { mapCatalogCourseToCardProps } from '../course/coursePresentation';

/**
 * Shared hook for public catalog courses (search bar + search page).
 */
export function usePublicCatalogCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await catalogApi.listCourses();
        const rows = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) {
          setCourses(rows.map(mapCatalogCourseToCardProps).filter(Boolean));
          setError('');
        }
      } catch (e) {
        if (!cancelled) {
          setCourses([]);
          setError(e?.message || 'Failed to load courses');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { courses, loading, error };
}
