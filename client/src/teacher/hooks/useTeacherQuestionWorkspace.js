import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { teacherApi } from '../../api/teacherApi';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';

const PAGE_SIZE = 20;

function isLegacyQuestionRouteParam(value) {
  return /^\d+$/.test(String(value || '').trim());
}

export function useTeacherQuestionWorkspace() {
  const { threadId: routeThreadId, questionId: routeQuestionId } = useParams();
  const navigate = useNavigate();
  const searchRef = useRef(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ all: 0, sent: 0, seen: 0, answered: 0, unread: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
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

  const fetchInbox = useCallback(
    async ({ pageNum = 1, append = false } = {}) => {
      if (append) setListLoadingMore(true);
      else setListLoading(true);
      setListError('');
      try {
        const response = await teacherApi.questionThreads({
          page: pageNum,
          limit: PAGE_SIZE,
          status: statusFilter,
          search: debouncedSearch,
          pinned_only: pinnedOnly,
        });
        const data = response?.data ?? {};
        const nextItems = Array.isArray(data.items) ? data.items : [];
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setSummary(data.summary ?? { all: 0, sent: 0, seen: 0, answered: 0, unread: 0 });
        setPage(data.pagination?.page ?? pageNum);
        setTotalPages(data.pagination?.total_pages ?? 0);
      } catch (err) {
        setListError(err.message || 'Could not load conversations.');
        if (!append) setItems([]);
      } finally {
        setListLoading(false);
        setListLoadingMore(false);
      }
    },
    [statusFilter, debouncedSearch, pinnedOnly]
  );

  useEffect(() => {
    setPage(1);
    fetchInbox({ pageNum: 1, append: false });
  }, [fetchInbox]);

  useEffect(() => {
    if (routeThreadId) {
      setSelectedThreadId(String(routeThreadId));
      return;
    }
    if (routeQuestionId && isLegacyQuestionRouteParam(routeQuestionId)) {
      let cancelled = false;
      setResolvingLegacy(true);
      teacherApi
        .questionThreadId(routeQuestionId)
        .then((response) => {
          if (cancelled) return;
          const nextThreadId = response?.data?.threadId;
          if (nextThreadId) {
            navigate(`/teacher/questions/thread/${encodeURIComponent(nextThreadId)}`, { replace: true });
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
      const response = await teacherApi.questionThread(threadId);
      const data = response?.data ?? null;
      setThread(data);
      setItems((prev) =>
        prev.map((item) =>
          String(item.threadId) === String(threadId)
            ? { ...item, isUnread: false, unreadCount: 0 }
            : item
        )
      );
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
        navigate(`/teacher/questions/thread/${encodeURIComponent(nextId)}`, { replace: false });
      } else {
        navigate('/teacher/questions', { replace: false });
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
    fetchInbox({ pageNum: 1, append: false });
  }, [fetchInbox]);

  const loadMore = useCallback(() => {
    if (listLoadingMore || page >= totalPages) return;
    fetchInbox({ pageNum: page + 1, append: true });
  }, [fetchInbox, listLoadingMore, page, totalPages]);

  const togglePin = useCallback(
    async (questionId, pinned) => {
      if (!questionId) return;
      await teacherApi.pinQuestion(questionId, pinned);
      setItems((prev) =>
        prev.map((item) =>
          String(item.latestQuestionId) === String(questionId)
            ? { ...item, isPinned: pinned }
            : item
        )
      );
      if (pinnedOnly && !pinned) {
        refreshInbox();
      }
    },
    [pinnedOnly, refreshInbox]
  );

  const onAnswered = useCallback(
    (updatedDetail) => {
      setThread((prev) => {
        if (!prev || !updatedDetail) return prev;
        const messages = prev.messages.map((message) =>
          String(message.id) === String(updatedDetail.id)
            ? {
                ...message,
                status: updatedDetail.status,
                answer: updatedDetail.answer,
                answerImageUrl: updatedDetail.answerImageUrl,
                answerAudioUrl: updatedDetail.answerAudioUrl,
                answeredAt: updatedDetail.answeredAt,
                updatedAt: updatedDetail.updatedAt,
                canAnswer: false,
              }
            : message
        );
        const activeQuestionId = messages.find((message) => message.canAnswer)?.id ?? null;
        return {
          ...prev,
          messages,
          activeQuestionId,
          bodyPreview: updatedDetail.answer || prev.bodyPreview,
        };
      });
      refreshInbox();
      if (selectedThreadId) loadThread(selectedThreadId);
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
    pinnedOnly,
    setPinnedOnly,
    items,
    summary,
    listLoading,
    listLoadingMore,
    listError,
    selectedThreadId,
    selectedIndex,
    thread,
    context: thread?.context ?? null,
    detailLoading: detailLoading || resolvingLegacy,
    detailError,
    selectThread,
    refreshInbox,
    loadMore,
    hasMore: page < totalPages,
    togglePin,
    onAnswered,
    goNext,
    goPrevious,
    canGoNext: selectedIndex >= 0 && selectedIndex < items.length - 1,
    canGoPrevious: selectedIndex > 0,
    chatOpen,
  };
}
