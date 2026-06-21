import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import HistoryCharts from './components/HistoryCharts';
import HistoryEmpty from './components/HistoryEmpty';
import HistoryError from './components/HistoryError';
import HistoryFilters from './components/HistoryFilters';
import HistoryList from './components/HistoryList';
import HistoryPagination from './components/HistoryPagination';
import HistorySkeleton from './components/HistorySkeleton';
import HistoryStatsCards from './components/HistoryStatsCards';
import { useTestHistory } from './hooks/useTestHistory';
import './styles/test-history.css';

const PAGE_SIZE = 10;

export default function TestHistoryPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [submittedDate, setSubmittedDate] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const { data, status, error, reload } = useTestHistory({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch,
    status: statusFilter,
    subjectId,
    dateRange,
    submittedDate,
  });

  const isLoading = status === 'loading';
  const hasFilters =
    Boolean(debouncedSearch) ||
    statusFilter !== 'all' ||
    subjectId !== 'all' ||
    dateRange !== 'all' ||
    Boolean(submittedDate);

  const subjects = data?.filterOptions?.subjects ?? [];
  const totalCount = data?.statistics?.totalTests ?? data?.pagination?.totalItems ?? 0;
  const resultCount = data?.pagination?.totalItems ?? 0;

  function resetPage() {
    setPage(1);
  }

  function handleSearchChange(value) {
    setSearchInput(value);
    resetPage();
  }

  function handleStatusChange(value) {
    setStatusFilter(value);
    resetPage();
  }

  function handleSubjectChange(value) {
    setSubjectId(value);
    resetPage();
  }

  function handleDateRangeChange(value) {
    setDateRange(value);
    if (value !== 'all') setSubmittedDate('');
    resetPage();
  }

  function handleSubmittedDateChange(value) {
    setSubmittedDate(value);
    if (value) setDateRange('all');
    resetPage();
  }

  function clearFilters() {
    setSearchInput('');
    setStatusFilter('all');
    setSubjectId('all');
    setDateRange('all');
    setSubmittedDate('');
    resetPage();
  }

  return (
    <div className="th-page th-page--dashboard">
      <header className="th-header">
        <div>
          <h1 className="th-title th-title--light">Results</h1>
          <p className="th-subtitle th-subtitle--light">
            Filter by subject, submission date, or pass/fail — search by test name, subject, or exact date.
          </p>
        </div>
        <Link className="th-header__cta" to="/dashboard/tests">
          Browse tests
        </Link>
      </header>

      {isLoading && !data ? <HistorySkeleton /> : null}

      {status === 'error' ? <HistoryError message={error} onRetry={reload} /> : null}

      {data ? (
        <>
          <HistoryStatsCards statistics={data.statistics} />

          <HistoryCharts items={data.items} statistics={data.statistics} />

          <HistoryFilters
            search={searchInput}
            status={statusFilter}
            subjectId={subjectId}
            dateRange={dateRange}
            submittedDate={submittedDate}
            subjects={subjects}
            resultCount={resultCount}
            totalCount={totalCount}
            onSearchChange={handleSearchChange}
            onStatusChange={handleStatusChange}
            onSubjectChange={handleSubjectChange}
            onDateRangeChange={handleDateRangeChange}
            onSubmittedDateChange={handleSubmittedDateChange}
            onClear={clearFilters}
            disabled={isLoading}
          />

          {isLoading ? (
            <p className="th-loading-note th-loading-note--light" role="status" aria-live="polite">
              Updating…
            </p>
          ) : null}

          {data.items.length === 0 ? (
            <HistoryEmpty hasFilters={hasFilters} />
          ) : (
            <>
              <HistoryList items={data.items} />
              <HistoryPagination
                pagination={data.pagination}
                onPageChange={setPage}
                disabled={isLoading}
              />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
