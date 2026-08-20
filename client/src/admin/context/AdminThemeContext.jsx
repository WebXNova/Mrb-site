import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import {
  clearAdminThemeBootDocument,
  persistAdminTheme,
  readStoredAdminTheme,
  resolveAdminTheme,
} from '../utils/adminThemeStorage';

const AdminThemeContext = createContext(null);

export function AdminThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => resolveAdminTheme());

  useLayoutEffect(() => {
    clearAdminThemeBootDocument();
  }, []);

  const setTheme = useCallback((next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    setThemeState(value);
    persistAdminTheme(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      persistAdminTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === 'dark',
    }),
    [theme, setTheme, toggleTheme]
  );

  return <AdminThemeContext.Provider value={value}>{children}</AdminThemeContext.Provider>;
}

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) {
    throw new Error('useAdminTheme must be used within AdminThemeProvider');
  }
  return ctx;
}

/** Read theme without provider (e.g. initial shell render). */
export function getInitialAdminTheme() {
  return readStoredAdminTheme() || 'light';
}
