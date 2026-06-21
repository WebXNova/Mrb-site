import { useCallback, useEffect, useState } from 'react';
import { studentApi } from '../../api/studentApi';
import { mockStudentDashboard } from '../data/mockStudentData';
import { normaliseStudentDashboard } from '../utils/normaliseStudentDashboard';

export function useStudentLectures() {
  const [lectures, setLectures] = useState(mockStudentDashboard.lectures);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await studentApi.dashboard();
      const norm = normaliseStudentDashboard(response?.data || mockStudentDashboard);
      setLectures(norm.lectures);
      return norm;
    } catch (err) {
      setError(err.message || 'Failed to load lectures.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      await load();
      if (!mounted) return;
    })();

    return () => {
      mounted = false;
    };
  }, [load]);

  const markLectureCompleted = useCallback((lectureId) => {
    setLectures((prev) =>
      prev.map((lecture) =>
        String(lecture.id) === String(lectureId) ? { ...lecture, completed: true } : lecture
      )
    );
  }, []);

  return { lectures, loading, error, refresh: load, markLectureCompleted };
}
