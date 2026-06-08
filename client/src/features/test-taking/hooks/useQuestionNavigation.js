import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getQuestionStatus } from '../utils/questionStatus';

export function useQuestionNavigation(questionIds) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visited, setVisited] = useState(() => new Set());
  const questionRef = useRef(null);

  const currentId = questionIds[currentIndex] ?? null;

  useEffect(() => {
    if (!currentId) return;
    setVisited((prev) => {
      if (prev.has(currentId)) return prev;
      const next = new Set(prev);
      next.add(currentId);
      return next;
    });
  }, [currentId]);

  useEffect(() => {
    questionRef.current?.focus({ preventScroll: true });
  }, [currentIndex]);

  const goToIndex = useCallback(
    (index) => {
      if (questionIds.length === 0) return;
      const clamped = Math.max(0, Math.min(questionIds.length - 1, index));
      setCurrentIndex(clamped);
    },
    [questionIds.length]
  );

  const goPrevious = useCallback(() => {
    goToIndex(currentIndex - 1);
  }, [currentIndex, goToIndex]);

  const goNext = useCallback(() => {
    goToIndex(currentIndex + 1);
  }, [currentIndex, goToIndex]);

  const statusByQuestion = useMemo(() => {
    const map = new Map();
    for (const id of questionIds) {
      map.set(id, 'unvisited');
    }
    return map;
  }, [questionIds]);

  const getStatus = useCallback(
    (questionId, answers, currentQuestionId) =>
      getQuestionStatus({
        questionId,
        currentId: currentQuestionId,
        answers,
        visited,
      }),
    [visited]
  );

  return {
    currentIndex,
    currentId,
    visited,
    questionRef,
    goToIndex,
    goPrevious,
    goNext,
    canGoPrevious: currentIndex > 0,
    canGoNext: currentIndex < questionIds.length - 1,
    statusByQuestion,
    getStatus,
  };
}
