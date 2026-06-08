import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
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
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const { data, status, error, reload } = useTestHistory({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch,
    status: statusFilter,
  });

  const isLoading = status === 'loading';
  const hasFilters = Boolean(debouncedSearch) || statusFilter !== 'all';

  function handleSearchChange(value) {
    setSearchInput(value);
    setPage(1);
  }

  function handleStatusChange(value) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div className="th-page">
      <header className="th-header">
        <div>
          <h1 className="th-title">Results</h1>
          <p className="th-subtitle">Official results for your completed test attempts.</p>
        </div>
        <Link className="btn btn--secondary btn--sm" to="/dashboard/tests">
          Browse tests
        </Link>
      </header>

      {isLoading && !data ? <HistorySkeleton /> : null}

      {status === 'error' ? <HistoryError message={error} onRetry={reload} /> : null}

      {data ? (
        <>
          <HistoryStatsCards statistics={data.statistics} />

          <HistoryFilters
            search={searchInput}
            status={statusFilter}
            onSearchChange={handleSearchChange}
            onStatusChange={handleStatusChange}
            disabled={isLoading}
          />

          {isLoading ? (
            <p className="th-loading-note" role="status" aria-live="polite">
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
