import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Mobile: bottom nav + compact search (<768px). */
export function useIsStudentMobileNav() {
  return useMediaQuery('(max-width: 767px)');
}

/** Tablet: overlay sidebar + bottom nav (768px–1023px). */
export function useIsStudentTabletNav() {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

/** Overlay navigation (mobile + tablet). */
export function useIsStudentOverlayNav() {
  return useMediaQuery('(max-width: 1023px)');
}

/** Laptop: persistent collapsible sidebar (1024px–1279px). */
export function useIsStudentLaptopNav() {
  return useMediaQuery('(min-width: 1024px) and (max-width: 1279px)');
}

/** Large desktop: expanded sidebar by default (>=1280px). */
export function useIsStudentLargeDesktopNav() {
  return useMediaQuery('(min-width: 1280px)');
}
