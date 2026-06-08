import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside a container while active.
 * @param {boolean} active
 * @param {{ onEscape?: () => void, escapeEnabled?: boolean }} [options]
 */
export function useFocusTrap(active, { onEscape, escapeEnabled = true } = {}) {
  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active || !containerRef.current) return undefined;

    const root = containerRef.current;
    previousFocusRef.current = document.activeElement;

    const getFocusable = () => Array.from(root.querySelectorAll(FOCUSABLE));

    const focusFirst = () => {
      const items = getFocusable();
      items[0]?.focus();
    };

    focusFirst();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && escapeEnabled) {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    }

    root.addEventListener('keydown', handleKeyDown);

    return () => {
      root.removeEventListener('keydown', handleKeyDown);
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [active, escapeEnabled]);

  return containerRef;
}
