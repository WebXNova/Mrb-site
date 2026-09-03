import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Paginated navigation over exam items (sections + questions) for one-question-per-page display.
 *
 * @param {Array<{ type: string, key: string }>} examItems
 */
export function useExamItemNavigation(examItems) {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [visitedQuestionIds, setVisitedQuestionIds] = useState(() => new Set());
  const focusRef = useRef(null);

  const currentItem = examItems[currentItemIndex] ?? null;
  const currentQuestionId =
    currentItem?.type === 'question' ? String(currentItem.question.id) : null;

  useEffect(() => {
    if (!currentQuestionId) return;
    const qid = String(currentQuestionId);
    setVisitedQuestionIds((prev) => {
      if (prev.has(qid)) return prev;
      const next = new Set(prev);
      next.add(qid);
      return next;
    });
  }, [currentQuestionId]);

  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, [currentItemIndex]);

  const goToItemIndex = useCallback(
    (index) => {
      if (!examItems.length) return;
      const clamped = Math.max(0, Math.min(examItems.length - 1, index));
      setCurrentItemIndex(clamped);
    },
    [examItems.length]
  );

  const goPrevious = useCallback(() => {
    goToItemIndex(currentItemIndex - 1);
  }, [currentItemIndex, goToItemIndex]);

  const goNext = useCallback(() => {
    goToItemIndex(currentItemIndex + 1);
  }, [currentItemIndex, goToItemIndex]);

  const questionIndex = useMemo(() => {
    if (currentItem?.type === 'question') return currentItem.questionNumber - 1;
    let idx = 0;
    for (let i = 0; i < currentItemIndex && i < examItems.length; i += 1) {
      if (examItems[i].type === 'question') idx += 1;
    }
    return idx;
  }, [currentItem, currentItemIndex, examItems]);

  return {
    currentItemIndex,
    currentItem,
    currentQuestionId,
    questionIndex,
    visitedQuestionIds,
    focusRef,
    goToItemIndex,
    goPrevious,
    goNext,
    canGoPrevious: currentItemIndex > 0,
    canGoNext: currentItemIndex < examItems.length - 1,
  };
}
