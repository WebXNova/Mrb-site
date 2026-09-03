import { useCallback, useEffect, useState } from 'react';
import { studentApi } from '../../api/studentApi';

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function pickFetcher({ courseId, subjectId, chapterId, lectureId }) {
  const cid = positiveId(courseId);
  if (!cid) return null;
  const lid = positiveId(lectureId);
  if (lid) {
    return () => studentApi.lectureNotes(cid, lid);
  }
  const chid = positiveId(chapterId);
  if (chid) {
    return () => studentApi.chapterNotes(cid, chid);
  }
  const sid = positiveId(subjectId);
  if (sid) {
    return () => studentApi.subjectNotes(cid, sid);
  }
  return () => studentApi.courseNotes(cid);
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
    } catch {
      /* Keep the notes list visible if a single file download fails. */
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
