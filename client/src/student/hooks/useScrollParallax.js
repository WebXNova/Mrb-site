import { useEffect } from 'react';

/** Binds scroll position to CSS custom properties on a dashboard root element. */
export function useScrollParallax(ref) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    function onScroll() {
      const y = window.scrollY || 0;
      node.style.setProperty('--sd-scroll-y', String(y));
      node.style.setProperty('--sd-scroll-ratio', String(Math.min(y / 800, 1)));
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ref]);
}
