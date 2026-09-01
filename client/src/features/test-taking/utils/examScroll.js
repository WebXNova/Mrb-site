/**
 * Single-scroller helpers for the exam runtime.
 * Fullscreen uses the exam container as the scroll root; otherwise the document scrolls.
 */

export const EXAM_FULLSCREEN_HTML_CLASS = 'tt-exam-fullscreen-active';

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getFullscreenElement() {
  if (typeof document === 'undefined') return null;
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

/**
 * Canonical scroll root for jump-to-question.
 * Returns the exam node when it is (or should be) the scrolling container.
 */
export function getExamScrollContainer(examNode) {
  if (!examNode || typeof document === 'undefined') return null;
  const active = getFullscreenElement();
  if (active === examNode || examNode.contains(active) || examNode.classList?.contains('tt-exam--is-fullscreen')) {
    return examNode;
  }
  return null;
}

/**
 * Compute the scrollTop that places a question just below a sticky header.
 */
export function computeQuestionScrollTop({
  containerScrollTop = 0,
  questionTop = 0,
  containerTop = 0,
  stickyHeaderHeight = 0,
  extraOffset = 8,
} = {}) {
  return Math.max(
    0,
    containerScrollTop + (questionTop - containerTop) - stickyHeaderHeight - extraOffset
  );
}

export function measureStickyHeaderHeight(examNode) {
  const header = examNode?.querySelector?.('.tt-header');
  return header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
}

export function scrollQuestionIntoView(questionNode, examNode) {
  if (!(questionNode instanceof HTMLElement)) return;

  const reduceMotion = prefersReducedMotion();
  const behavior = reduceMotion ? 'auto' : 'smooth';
  const container = getExamScrollContainer(examNode);

  if (!container) {
    questionNode.scrollIntoView({ behavior, block: 'start' });
    return;
  }

  const headerHeight = measureStickyHeaderHeight(container);
  const nextTop = computeQuestionScrollTop({
    containerScrollTop: container.scrollTop,
    questionTop: questionNode.getBoundingClientRect().top,
    containerTop: container.getBoundingClientRect().top,
    stickyHeaderHeight: headerHeight,
  });

  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: nextTop, behavior });
    return;
  }

  container.scrollTop = nextTop;
}

export function applyExamFullscreenDocumentClass(active) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(EXAM_FULLSCREEN_HTML_CLASS, Boolean(active));
}
