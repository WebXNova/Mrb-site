import { useCallback, useEffect, useState } from 'react';
import { useIsStudentLaptopNav, useIsStudentOverlayNav } from './useMediaQuery';

const STORAGE_KEY = 'mrb_student_sidebar_collapsed';

function readCollapsedPref() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* ignore quota / private mode */
  }
  return null;
}

function writeCollapsedPref(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Shared student shell navigation state.
 * Overlay (<1024): hamburger opens the drawer.
 * Persistent (>=1024): hamburger expands/collapses the in-flow sidebar.
 * Laptop (1024–1279) defaults to collapsed; large desktop defaults to expanded.
 */
export function useStudentShellNav() {
  const isOverlayNav = useIsStudentOverlayNav();
  const isLaptopNav = useIsStudentLaptopNav();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsedPref, setCollapsedPref] = useState(() => readCollapsedPref());

  const sidebarCollapsed = !isOverlayNav && (collapsedPref ?? isLaptopNav);

  useEffect(() => {
    if (!isOverlayNav) setNavOpen(false);
  }, [isOverlayNav]);

  const toggleNav = useCallback(() => {
    if (isOverlayNav) {
      setNavOpen((open) => !open);
      return;
    }
    setCollapsedPref((current) => {
      const next = !(current ?? isLaptopNav);
      writeCollapsedPref(next);
      return next;
    });
  }, [isOverlayNav, isLaptopNav]);

  const closeNav = useCallback(() => setNavOpen(false), []);

  return {
    isOverlayNav,
    isLaptopNav,
    navOpen,
    sidebarCollapsed,
    toggleNav,
    closeNav,
  };
}
