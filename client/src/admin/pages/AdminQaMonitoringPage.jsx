import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import TeacherProfileCard from '../components/qa-monitoring/TeacherProfileCard';
import MonitoringStatsRow from '../components/qa-monitoring/MonitoringStatsRow';
import MonitoringFilters from '../components/qa-monitoring/MonitoringFilters';
import QaTimeline from '../components/qa-monitoring/QaTimeline';
import '../styles/admin-qa-monitoring.css';

const PAGE_SIZE = 15;
const POLL_MS = 30000;
const SEARCH_DEBOUNCE_MS = 350;

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.35 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

function buildQuery(filters, page) {
  return {
    page,
    limit: PAGE_SIZE,
    status: filters.status || undefined,
    subject: filters.subject || undefined,
    search: filters.search || undefined,
    teacherId: filters.teacherId || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  };
}

export default function AdminQaMonitoringPage() {
  const token = getAdminToken();
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const [filters, setFilters] = useState({
    teacherId: '',
    status: '',
    subject: '',
    search: '',
    dateFrom: '',
    dateTo: '',
  });

  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const activeFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const isOverview = !filters.teacherId;

  useEffect(() => {
    adminApi
      .teachers(token)
      .then((res) => {
        const list = res?.data ?? res ?? [];
        setTeachers(Array.isArray(list) ? list : []);
      })
      .catch(() => setTeachers([]));
  }, [token]);

  useEffect(() => {
    if (!filters.teacherId) {
      setSelectedTeacher(null);
      setTeacherLoading(false);
      return;
    }
    setTeacherLoading(true);
    adminApi
      .teacher(token, filters.teacherId)
      .then((res) => setSelectedTeacher(res?.data ?? res ?? null))
      .catch(() => setSelectedTeacher(null))
      .finally(() => setTeacherLoading(false));
  }, [token, filters.teacherId]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [filters.search]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await adminApi.qaMonitoringStats(token, {
        teacherId: activeFilters.teacherId || undefined,
        dateFrom: activeFilters.dateFrom || undefined,
        dateTo: activeFilters.dateTo || undefined,
      });
      setStats(response?.data ?? response ?? null);
      setLastRefresh(Date.now());
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [token, activeFilters.teacherId, activeFilters.dateFrom, activeFilters.dateTo]);

  const loadPage = useCallback(
    async (pageNum, { append = false } = {}) => {
      if (append) setLoadingMore(true);
      else setListLoading(true);

      try {
        const response = await adminApi.qaMonitoringQuestions(
          token,
          buildQuery(activeFilters, pageNum)
        );
        const data = response?.data ?? response ?? {};
        const nextItems = Array.isArray(data.items) ? data.items : [];
        const pagination = data.pagination ?? {};

        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setPage(pageNum);
        setHasMore(pageNum < (pagination.totalPages ?? 1));
      } catch (err) {
        if (!append) setItems([]);
        toast.error(err.message || 'Failed to load conversations');
      } finally {
        setListLoading(false);
        setLoadingMore(false);
      }
    },
    [token, activeFilters]
  );

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    loadPage(1, { append: false });
  }, [loadPage]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      if (page === 1) loadPage(1, { append: false });
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [loadStats, loadPage, page]);

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    if (key !== 'search') {
      setPage(1);
      setHasMore(true);
    }
  }

  function handleLoadMore() {
    if (loadingMore || listLoading || !hasMore) return;
    loadPage(page + 1, { append: true });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const result = await adminApi.exportQaMonitoring(token, {
        type: 'questions',
        format: 'csv',
        ...buildQuery(activeFilters, 1),
        limit: 5000,
      });
      if (result?.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || 'qa-monitoring-export.csv';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Report exported');
      }
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <motion.div
      className="qa-monitor admin-page"
      variants={pageVariants}
      initial="initial"
      animate="animate"
    >
      <header className="qa-monitor__header">
        <div className="qa-monitor__title-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h1>Teacher Monitoring</h1>
            <span className="qa-monitor__badge">Read-only audit</span>
          </div>
          <p>
            Monitor teacher Q&A performance, response times, and conversation history. No edits or
            interventions — analytics and oversight only.
          </p>
        </div>
        <div className="qa-monitor__header-actions">
          <span className="qa-monitor__live">
            <span className="qa-monitor__live-dot" />
            Live · {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        </div>
      </header>

      <TeacherProfileCard
        teacher={selectedTeacher}
        overview={isOverview}
        lastActivity={stats?.lastActivity}
        loading={teacherLoading}
      />

      <MonitoringStatsRow stats={stats} loading={statsLoading} />

      <MonitoringFilters
        teachers={teachers}
        filters={filters}
        onFilterChange={handleFilterChange}
        onExport={handleExport}
        exporting={exporting}
      />

      <section aria-label="Conversation timeline">
        <QaTimeline
          items={items}
          loading={listLoading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
        />
      </section>
    </motion.div>
  );
}
