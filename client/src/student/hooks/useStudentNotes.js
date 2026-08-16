import { useCallback, useEffect, useState } from 'react';
import { studentApi } from '../../api/studentApi';

function pickFetcher({ courseId, subjectId, chapterId, lectureId }) {
  if (!courseId) return null;
  if (lectureId) {
    return () => studentApi.lectureNotes(courseId, lectureId);
  }
  if (chapterId) {
    return () => studentApi.chapterNotes(courseId, chapterId);
  }
  if (subjectId) {
    return () => studentApi.subjectNotes(courseId, subjectId);
  }
  return () => studentApi.courseNotes(courseId);
}

export function useStudentNotes({ courseId, subjectId = null, chapterId = null, lectureId = null }) {
  const [groups, setGroups] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(async () => {
    const fetcher = pickFetcher({ courseId, subjectId, chapterId, lectureId });
    if (!fetcher) {
      setGroups([]);
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetcher();
      const payload = response?.data ?? {};
      setGroups(Array.isArray(payload.groups) ? payload.groups : []);
      setSummary(payload.summary ?? null);
    } catch (err) {
      setGroups([]);
      setSummary(null);
      setError(err?.message || 'Failed to load notes.');
    } finally {
      setLoading(false);
    }
  }, [courseId, subjectId, chapterId, lectureId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const downloadNote = useCallback(async (note) => {
    if (!note?.id) return;
    setDownloadingId(note.id);
    try {
      const { blob, filename } = await studentApi.downloadCourseNote(note.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename || `${note.title || 'note'}.bin`;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }, []);

  return {
    groups,
    summary,
    loading,
    error,
    downloadingId,
    refresh: load,
    downloadNote,
    totalNotes: summary?.totalNotes ?? groups.reduce((sum, group) => sum + group.notes.length, 0),
  };
}
