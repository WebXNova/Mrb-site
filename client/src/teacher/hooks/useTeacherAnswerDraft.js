import { useCallback, useEffect, useRef } from 'react';

const DRAFT_PREFIX = 'tq-teacher-draft:';

function readDraft(questionId) {
  if (!questionId) return '';
  try {
    return localStorage.getItem(`${DRAFT_PREFIX}${questionId}`) || '';
  } catch {
    return '';
  }
}

function writeDraft(questionId, text) {
  if (!questionId) return;
  try {
    const key = `${DRAFT_PREFIX}${questionId}`;
    const trimmed = String(text || '');
    if (!trimmed.trim()) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, trimmed);
  } catch {
    // ignore quota errors
  }
}

export function clearTeacherAnswerDraft(questionId) {
  if (!questionId) return;
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${questionId}`);
  } catch {
    // ignore
  }
}

/**
 * Auto-save teacher answer drafts per question in localStorage.
 */
export function useTeacherAnswerDraft(questionId) {
  const timerRef = useRef(null);

  const loadDraft = useCallback(() => readDraft(questionId), [questionId]);

  const saveDraft = useCallback(
    (text) => {
      if (!questionId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => writeDraft(questionId, text), 400);
    },
    [questionId]
  );

  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearTeacherAnswerDraft(questionId);
  }, [questionId]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { loadDraft, saveDraft, clearDraft };
}
