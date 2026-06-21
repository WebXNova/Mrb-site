export const STUDENT_THEME_STORAGE_KEY = 'mrb-student-theme';

export function readStoredStudentTheme() {
  try {
    const stored = localStorage.getItem(STUDENT_THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function resolveStudentTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = readStoredStudentTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function syncStudentThemeDocument(theme = resolveStudentTheme()) {
  if (typeof document === 'undefined') return theme;
  document.documentElement.setAttribute('data-student-theme', theme);
  return theme;
}

export function isStudentPortalPath(pathname) {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/student' ||
    pathname.startsWith('/student/')
  );
}
