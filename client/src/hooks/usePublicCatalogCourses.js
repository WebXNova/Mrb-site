import { useCallback, useEffect, useState } from 'react';
import {
  buildCatalogCategoryFilterState,
  fetchPublicCatalogCourses,
  fetchPublicCourseCategories,
} from '../course/publicCatalogQueries';

/**
 * Loads active public categories once (for filter bars, nav, landing pages).
 */
export function usePublicCourseCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchPublicCourseCategories();
        if (!cancelled) {
          setCategories(rows);
          setError('');
        }
      } catch (e) {
        if (!cancelled) {
          setCategories([]);
          setError(e?.message || 'Failed to load categories');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, loading, error };
}

/**
 * Loads public catalog courses; re-fetches when category filter changes (server-side filter for scale).
 * @param {{ categoryId?: number|null }} options
 */
export function usePublicCatalogCourses(options = {}) {
  const categoryId = options.categoryId ?? null;
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const filter = buildCatalogCategoryFilterState(categoryId);
      const rows = await fetchPublicCatalogCourses(filter);
      setCourses(rows);
      setError('');
    } catch (e) {
      setCourses([]);
      setError(e?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const filter = buildCatalogCategoryFilterState(categoryId);
        const rows = await fetchPublicCatalogCourses(filter);
        if (!cancelled) {
          setCourses(rows);
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
  }, [categoryId]);

  return { courses, loading, error, reload };
}
