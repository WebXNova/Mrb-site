import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';

function isLegacyQuestionRouteParam(value) {
  return /^\d+$/.test(String(value || '').trim());
}

export function useStudentQuestionWorkspace() {
  const { threadId: routeThreadId, id: routeQuestionId } = useParams();
  const navigate = useNavigate();
  const searchRef = useRef(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ all: 0, sent: 0, seen: 0, answered: 0, subjects: 0 });
  const [course, setCourse] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [selectedThreadId, setSelectedThreadId] = useState(routeThreadId ? String(routeThreadId) : null);
  const [thread, setThread] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [resolvingLegacy, setResolvingLegacy] = useState(false);

  const selectedIndex = useMemo(
    () => items.findIndex((item) => String(item.threadId) === String(selectedThreadId)),
    [items, selectedThreadId]
  );

  const fetchInbox = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const response = await studentApi.questionThreads({
        status: statusFilter,
        search: debouncedSearch,
      });
      const data = response?.data ?? {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary ?? { all: 0, sent: 0, seen: 0, answered: 0, subjects: 0 });
      setCourse(data.course ?? null);
    } catch (err) {
      setListError(err.message || 'Could not load your subject chats.');
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    if (routeThreadId) {
      setSelectedThreadId(String(routeThreadId));
      return;
    }
    if (routeQuestionId && isLegacyQuestionRouteParam(routeQuestionId)) {
      let cancelled = false;
      setResolvingLegacy(true);
      studentApi
        .questionThreadId(routeQuestionId)
        .then((response) => {
          if (cancelled) return;
          const nextThreadId = response?.data?.threadId;
          if (nextThreadId) {
            navigate(`/student/questions/thread/${encodeURIComponent(nextThreadId)}`, { replace: true });
          } else {
            setDetailError('Could not open this conversation.');
          }
        })
        .catch((err) => {
          if (!cancelled) setDetailError(err.message || 'Could not open this conversation.');
        })
        .finally(() => {
          if (!cancelled) setResolvingLegacy(false);
        });
      return () => {
        cancelled = true;
      };
    }
    setSelectedThreadId(null);
  }, [routeThreadId, routeQuestionId, navigate]);

  const loadThread = useCallback(async (threadId) => {
    if (!threadId) {
      setThread(null);
      return;
    }
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await studentApi.questionThread(threadId);
      setThread(response?.data ?? null);
    } catch (err) {
      setThread(null);
      setDetailError(err.message || 'Could not load this conversation.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedThreadId && routeThreadId) loadThread(selectedThreadId);
    else if (!selectedThreadId) {
      setThread(null);
      setDetailError('');
    }
  }, [selectedThreadId, routeThreadId, loadThread]);

  const selectThread = useCallback(
    (threadId) => {
      const nextId = threadId ? String(threadId) : null;
      setSelectedThreadId(nextId);
      if (nextId) {
        navigate(`/student/questions/thread/${encodeURIComponent(nextId)}`, { replace: false });
      } else {
        navigate('/student/questions', { replace: false });
      }
    },
    [navigate]
  );

  useEffect(() => {
    if (!routeThreadId && !selectedThreadId && items.length > 0 && !listLoading && window.innerWidth > 820) {
      selectThread(items[0].threadId);
    }
  }, [items, listLoading, routeThreadId, selectedThreadId, selectThread]);

  const refreshInbox = useCallback(() => {
    fetchInbox();
  }, [fetchInbox]);

  const onQuestionSubmitted = useCallback(
    () => {
      if (selectedThreadId) loadThread(selectedThreadId);
      refreshInbox();
    },
    [loadThread, refreshInbox, selectedThreadId]
  );

  const goNext = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= items.length - 1) return;
    selectThread(items[selectedIndex + 1].threadId);
  }, [items, selectThread, selectedIndex]);

  const goPrevious = useCallback(() => {
    if (selectedIndex <= 0) return;
    selectThread(items[selectedIndex - 1].threadId);
  }, [items, selectThread, selectedIndex]);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = String(event.target?.tagName || '').toLowerCase();
      const editable = event.target?.isContentEditable;
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable) return;

      if (event.key === 'j') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'k') {
        event.preventDefault();
        goPrevious();
      } else if (event.key === '/') {
        event.preventDefault();
        focusSearch();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusSearch, goNext, goPrevious]);

  const chatOpen = Boolean(selectedThreadId && routeThreadId);

  return {
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    searchRef,
    items,
    summary,
    course,
    listLoading,
    listError,
    selectedThreadId,
    selectedIndex,
    thread,
    detailLoading: detailLoading || resolvingLegacy,
    detailError,
    selectThread,
    refreshInbox,
    onQuestionSubmitted,
    goNext,
    goPrevious,
    canGoNext: selectedIndex >= 0 && selectedIndex < items.length - 1,
    canGoPrevious: selectedIndex > 0,
    chatOpen,
  };
}
