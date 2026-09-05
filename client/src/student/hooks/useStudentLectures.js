import { useCallback, useEffect, useState } from 'react';
import { studentApi } from '../../api/studentApi';
import { mockStudentDashboard } from '../data/mockStudentData';

function normaliseLecturesPayload(raw) {
  const lectures = Array.isArray(raw?.lectures) ? raw.lectures : [];
  return lectures;
}

export function useStudentLectures() {
  const [lectures, setLectures] = useState(mockStudentDashboard.lectures);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await studentApi.lectures();
      const list = normaliseLecturesPayload(response?.data || { lectures: mockStudentDashboard.lectures });
      setLectures(list);
      return { lectures: list };
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
