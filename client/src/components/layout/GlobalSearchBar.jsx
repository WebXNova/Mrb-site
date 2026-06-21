import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePublicCatalogCourses } from '../../hooks/usePublicCatalogCourses';
import {
  formatCourseSearchMeta,
  navigateToSearch,
  searchCourses,
} from '../../utils/courseSearch';
import './GlobalSearchBar.css';

const GlobalSearchContext = createContext(null);
const SEARCH_DEBOUNCE_MS = 300;

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function useGlobalSearch() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error('GlobalSearch components must be used within GlobalSearchProvider');
  }
  return ctx;
}

function DesktopSearchField({
  inputId,
  inputRef,
  query,
  setQuery,
  focused,
  setFocused,
  suggestions,
  showSuggestions,
  showNoResults,
  isDebouncing,
  onSubmit,
  onKeyDown,
  onNavigate,
}) {
  return (
    <>
      <label className="global-search__label visually-hidden" htmlFor={inputId}>
        Search courses
      </label>
      <div className={`global-search__field ${focused ? 'global-search__field--focused' : ''}`}>
        <SearchIcon className="global-search__icon" />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          className="global-search__input"
          placeholder="Search courses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          enterKeyHint="search"
          aria-expanded={showSuggestions || showNoResults}
          aria-controls={`${inputId}-suggestions`}
        />
      </div>

      {focused && query.trim() ? (
        <ul
          id={`${inputId}-suggestions`}
          className="global-search__suggestions"
          role="listbox"
          aria-label="Course suggestions"
        >
          {isDebouncing ? (
            <li className="global-search__status" role="status">
              Searching…
            </li>
          ) : null}

          {!isDebouncing && showSuggestions
            ? suggestions.map((course) => (
                <li key={String(course.id)} role="option">
                  <Link
                    to={`/courses/${encodeURIComponent(String(course.id))}`}
                    className="global-search__suggestion"
                    onClick={() => {
                      setFocused(false);
                      onNavigate?.();
                    }}
                  >
                    <span className="global-search__suggestion-title">{course.title}</span>
                    <span className="global-search__suggestion-subject">
                      {formatCourseSearchMeta(course)}
                    </span>
                  </Link>
                </li>
              ))
            : null}

          {!isDebouncing && showNoResults ? (
            <li className="global-search__status" role="status">
              No courses found
            </li>
          ) : null}

          {!isDebouncing && suggestions.length > 0 ? (
            <li role="option">
              <button
                type="button"
                className="global-search__suggestion global-search__suggestion--all"
                onClick={() => onSubmit()}
              >
                View all results for &ldquo;{query.trim()}&rdquo;
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}

function MobileSearchResults({ query, debouncedQuery, results, isDebouncing, loading, onNavigate }) {
  const trimmed = query.trim();

  if (!trimmed) {
    return (
      <p className="global-search__mobile-status" role="status">
        Type to search courses by title, subject, or tags like FREE or MDCAT.
      </p>
    );
  }

  if (loading) {
    return <p className="global-search__mobile-status">Loading courses…</p>;
  }

  if (isDebouncing) {
    return <p className="global-search__mobile-status" role="status">Searching…</p>;
  }

  if (results.length === 0) {
    return <p className="global-search__mobile-status" role="status">No courses found</p>;
  }

  return (
    <ul className="global-search__mobile-results" aria-label="Search results">
      {results.map((course) => (
        <li key={String(course.id)}>
          <Link
            to={`/courses/${encodeURIComponent(String(course.id))}`}
            className="global-search__mobile-result"
            onClick={onNavigate}
          >
            <span className="global-search__mobile-result-title">{course.title}</span>
            {formatCourseSearchMeta(course) ? (
              <span className="global-search__mobile-result-meta">{formatCourseSearchMeta(course)}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function GlobalSearchProvider({ children }) {
  const desktopInputId = useId();
  const mobileInputId = useId();
  const navigate = useNavigate();
  const desktopInputRef = useRef(null);
  const mobileInputRef = useRef(null);
  const overlayRef = useRef(null);
  const { courses, loading } = usePublicCatalogCourses();

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  const searchResults = useMemo(
    () => searchCourses(debouncedQuery, courses),
    [debouncedQuery, courses]
  );

  const desktopSuggestions = useMemo(() => searchResults.slice(0, 6), [searchResults]);

  const isDebouncing = query.trim() !== debouncedQuery.trim() && Boolean(query.trim());
  const showSuggestions = focused && debouncedQuery.trim().length > 0 && desktopSuggestions.length > 0;
  const showNoResults =
    focused && debouncedQuery.trim().length > 0 && !isDebouncing && desktopSuggestions.length === 0;

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    setQuery('');
    setFocused(false);
  }, []);

  const openMobile = useCallback(() => {
    setMobileOpen(true);
    setFocused(true);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      const timer = window.setTimeout(() => mobileInputRef.current?.focus(), 150);
      return () => {
        window.clearTimeout(timer);
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [mobileOpen]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (mobileOpen) return;
      if (event.target.closest('.global-search__field, .global-search__suggestions')) return;
      setFocused(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [mobileOpen]);

  const submitSearch = useCallback(
    (value = query) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return;
      setFocused(false);
      setQuery('');
      setMobileOpen(false);
      navigateToSearch(navigate, trimmed);
    },
    [navigate, query]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitSearch();
      }
      if (event.key === 'Escape') {
        if (mobileOpen) closeMobile();
        else setFocused(false);
      }
    },
    [submitSearch, mobileOpen, closeMobile]
  );

  const value = {
    desktopInputId,
    mobileInputId,
    desktopInputRef,
    mobileInputRef,
    overlayRef,
    query,
    setQuery,
    debouncedQuery,
    searchResults,
    desktopSuggestions,
    isDebouncing,
    loading,
    focused,
    setFocused,
    showSuggestions,
    showNoResults,
    submitSearch,
    handleKeyDown,
    mobileOpen,
    openMobile,
    closeMobile,
  };

  return <GlobalSearchContext.Provider value={value}>{children}</GlobalSearchContext.Provider>;
}

/** Desktop / tablet expanded search field — centered in header. */
export function GlobalSearchDesktop() {
  const {
    desktopInputId,
    desktopInputRef,
    query,
    setQuery,
    focused,
    setFocused,
    desktopSuggestions,
    showSuggestions,
    showNoResults,
    isDebouncing,
    submitSearch,
    handleKeyDown,
    closeMobile,
  } = useGlobalSearch();

  return (
    <div className="global-search global-search--desktop">
      <DesktopSearchField
        inputId={desktopInputId}
        inputRef={desktopInputRef}
        query={query}
        setQuery={setQuery}
        focused={focused}
        setFocused={setFocused}
        suggestions={desktopSuggestions}
        showSuggestions={showSuggestions}
        showNoResults={showNoResults}
        isDebouncing={isDebouncing}
        onSubmit={submitSearch}
        onKeyDown={handleKeyDown}
        onNavigate={closeMobile}
      />
    </div>
  );
}

/** Mobile search icon — place beside hamburger in header tools. */
export function GlobalSearchMobileTrigger() {
  const { mobileOpen, openMobile } = useGlobalSearch();

  return (
    <button
      type="button"
      className="global-search__mobile-trigger navbar__icon-btn"
      aria-label="Open search"
      aria-expanded={mobileOpen}
      onClick={openMobile}
    >
      <SearchIcon className="global-search__mobile-trigger-icon" />
    </button>
  );
}

/** Full-width slide-down search overlay (mobile). */
export function GlobalSearchMobileOverlay() {
  const {
    mobileInputId,
    mobileInputRef,
    overlayRef,
    query,
    setQuery,
    debouncedQuery,
    searchResults,
    isDebouncing,
    loading,
    focused,
    setFocused,
    mobileOpen,
    closeMobile,
    handleKeyDown,
    submitSearch,
  } = useGlobalSearch();

  return (
    <div
      ref={overlayRef}
      className={`global-search__mobile-overlay ${mobileOpen ? 'global-search__mobile-overlay--open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Search courses"
      hidden={!mobileOpen}
    >
      <div className="global-search__mobile-panel">
        <div className="global-search__mobile-head">
          <div className="global-search__mobile-input-wrap">
            <label className="global-search__label visually-hidden" htmlFor={mobileInputId}>
              Search courses
            </label>
            <div className={`global-search__field ${focused ? 'global-search__field--focused' : ''}`}>
              <SearchIcon className="global-search__icon" />
              <input
                ref={mobileInputRef}
                id={mobileInputId}
                type="search"
                className="global-search__input"
                placeholder="Search courses…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          </div>
          <button
            type="button"
            className="global-search__mobile-close navbar__icon-btn"
            aria-label="Close search"
            onClick={closeMobile}
          >
            <CloseIcon className="global-search__mobile-close-icon" />
          </button>
        </div>

        <MobileSearchResults
          query={query}
          debouncedQuery={debouncedQuery}
          results={searchResults}
          isDebouncing={isDebouncing}
          loading={loading}
          onNavigate={closeMobile}
        />

        {query.trim() && !isDebouncing && searchResults.length > 0 ? (
          <button type="button" className="global-search__mobile-view-all" onClick={() => submitSearch()}>
            View all {searchResults.length} results
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Use GlobalSearchProvider + subcomponents in Navbar. */
export default function GlobalSearchBar() {
  return (
    <GlobalSearchProvider>
      <GlobalSearchDesktop />
      <GlobalSearchMobileTrigger />
      <GlobalSearchMobileOverlay />
    </GlobalSearchProvider>
  );
}
