import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { studentApi } from '../../../api/studentApi';
import { normaliseStudentDashboard } from '../../utils/normaliseStudentDashboard';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDashboardSearch } from '../../hooks/useDashboardSearch';
import StudentIcon from '../icons/StudentIcons';

let searchCache = null;
let searchCacheAt = 0;
const CACHE_TTL = 60_000;

async function loadSearchIndex() {
  if (searchCache && Date.now() - searchCacheAt < CACHE_TTL) return searchCache;
  try {
    const response = await studentApi.dashboard();
    searchCache = normaliseStudentDashboard(response?.data);
    searchCacheAt = Date.now();
    return searchCache;
  } catch {
    return searchCache || null;
  }
}

export default function StudentGlobalSearch({ compact = false }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 250);
  const results = useDashboardSearch(index, debouncedQuery);

  const showPanel = open && (debouncedQuery.length > 0 || query.length > 0);

  useEffect(() => {
    function onDocClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const ensureIndex = useCallback(async () => {
    const data = await loadSearchIndex();
    setIndex(data);
  }, []);

  function handleFocus() {
    setOpen(true);
    ensureIndex();
  }

  function handleExpand() {
    setExpanded(true);
    setOpen(true);
    ensureIndex();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function navigateTo(href) {
    setOpen(false);
    setExpanded(false);
    setQuery('');
    navigate(href);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      setExpanded(false);
      setQuery('');
      inputRef.current?.blur();
      return;
    }
    if (!showPanel || results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      navigateTo(results[activeIndex].href);
    }
  }

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery]);

  if (compact && !expanded) {
    return (
      <button
        type="button"
        className="sp-header-search-toggle"
        aria-label="Open search"
        onClick={handleExpand}
      >
        <StudentIcon name="search" size={20} />
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`sp-header-search${compact ? ' sp-header-search--expanded' : ''}`}
      role="search"
    >
      <StudentIcon name="search" size={18} className="sp-header-search__icon" />
      <input
        ref={inputRef}
        type="search"
        className="sp-header-search__input"
        placeholder="Search courses, lectures, tests…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={handleFocus}
        onKeyDown={onKeyDown}
        aria-label="Search dashboard"
        aria-expanded={showPanel}
        aria-controls="sp-header-search-results"
        aria-autocomplete="list"
        autoComplete="off"
      />
      {compact ? (
        <button
          type="button"
          className="sp-header-search__close"
          aria-label="Close search"
          onClick={() => {
            setExpanded(false);
            setOpen(false);
            setQuery('');
          }}
        >
          ×
        </button>
      ) : null}

      {showPanel ? (
        <ul id="sp-header-search-results" className="sp-header-search__results" role="listbox">
          {results.length === 0 ? (
            <li className="sp-header-search__empty" role="option">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </li>
          ) : (
            results.map((item, idx) => (
              <li key={item.id} role="option" aria-selected={idx === activeIndex}>
                <button
                  type="button"
                  className={`sp-header-search__result${idx === activeIndex ? ' sp-header-search__result--active' : ''}`}
                  onClick={() => navigateTo(item.href)}
                >
                  <StudentIcon name={item.icon} size={18} />
                  <span className="sp-header-search__result-copy">
                    <span className="sp-header-search__result-label">{item.label}</span>
                    <span className="sp-header-search__result-type">{item.type}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function StudentNotificationBell({ count = 0 }) {
  return (
    <Link
      to="/dashboard/notifications"
      className="sp-header-bell"
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
    >
      <StudentIcon
        name="bell"
        size={22}
        className={count > 0 ? 'sp-icon--bell-alert' : ''}
      />
      {count > 0 ? (
        <span className="sp-header-bell__badge">{count > 99 ? '99+' : count}</span>
      ) : null}
    </Link>
  );
}
