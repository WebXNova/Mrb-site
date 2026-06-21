import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  readStoredStudentTheme,
  resolveStudentTheme,
  syncStudentThemeDocument,
} from '../utils/studentThemeStorage';

const StudentThemeContext = createContext(null);

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function StudentThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredStudentTheme() || getSystemTheme());

  useEffect(() => {
    syncStudentThemeDocument(theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange(event) {
      if (!readStoredStudentTheme()) {
        setThemeState(event.matches ? 'dark' : 'light');
      }
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'dark' ? 'dark' : 'light');
    try {
      localStorage.setItem('mrb-student-theme', next === 'dark' ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('mrb-student-theme', next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, isDark: theme === 'dark' }),
    [theme, setTheme, toggleTheme]
  );

  return <StudentThemeContext.Provider value={value}>{children}</StudentThemeContext.Provider>;
}

export function useStudentTheme() {
  const ctx = useContext(StudentThemeContext);
  if (!ctx) {
    throw new Error('useStudentTheme must be used within StudentThemeProvider');
  }
  return ctx;
}
