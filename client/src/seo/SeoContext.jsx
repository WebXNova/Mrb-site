import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SeoContext = createContext(null);

/**
 * @typedef {object} PageSeoOverride
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [image]
 * @property {object | object[]} [structuredData]
 * @property {boolean} [noindex]
 */

export function SeoProvider({ children }) {
  const [pageSeo, setPageSeoState] = useState(null);

  const setPageSeo = useCallback((next) => {
    setPageSeoState(next);
  }, []);

  const clearPageSeo = useCallback(() => {
    setPageSeoState(null);
  }, []);

  const value = useMemo(
    () => ({ pageSeo, setPageSeo, clearPageSeo }),
    [pageSeo, setPageSeo, clearPageSeo]
  );

  return <SeoContext.Provider value={value}>{children}</SeoContext.Provider>;
}

export function useSeoContext() {
  const ctx = useContext(SeoContext);
  if (!ctx) {
    throw new Error('useSeoContext must be used within SeoProvider');
  }
  return ctx;
}

/**
 * Set page-level SEO overrides (e.g. dynamic course detail).
 * Clears on unmount.
 * @param {PageSeoOverride | null | undefined} seo
 */
export function usePageSeo(seo) {
  const { setPageSeo, clearPageSeo } = useSeoContext();

  useEffect(() => {
    if (seo) setPageSeo(seo);
    else clearPageSeo();
    return () => clearPageSeo();
  }, [
    seo?.title,
    seo?.description,
    seo?.image,
    seo?.noindex,
    seo?.structuredData,
    setPageSeo,
    clearPageSeo,
  ]);
}
