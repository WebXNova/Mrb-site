export const ADMIN_THEME_STORAGE_KEY = 'mrb-admin-theme';

export function readStoredAdminTheme() {
  try {
    const stored = localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return null;
}

/** Default admin theme when no preference is saved. */
export function resolveAdminTheme() {
  return readStoredAdminTheme() || 'light';
}

export function persistAdminTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  try {
    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  return value;
}

export function syncAdminThemeBootDocument(theme) {
  if (typeof document === 'undefined') return theme;
  const resolved = theme === 'dark' ? 'dark' : 'light';
  if (resolved === 'dark') {
    document.documentElement.setAttribute('data-admin-theme-boot', 'dark');
  } else {
    document.documentElement.removeAttribute('data-admin-theme-boot');
  }
  return resolved;
}

export function clearAdminThemeBootDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute('data-admin-theme-boot');
}
