import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import TestsEmptyState from '../components/public-tests/TestsEmptyState.jsx';
import MyTestRecordCard, { MyTestRecordSkeleton } from '../components/my-tests/MyTestRecordCard.jsx';
import { standaloneTestsApi } from '../api/standaloneTestsApi';
import { getStudentToken } from '../auth/session';
import { withSafeFromQuery } from '../utils/authRedirect';
import { MY_RESULTS_PATH } from '../utils/myResultsPaths';
import { useDebouncedValue } from '../components/admin/useDebouncedValue';
import { usePageSeo } from '../seo/SeoContext';
import './my-tests.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'free', label: 'Free' },
  { id: 'paid', label: 'Paid' },
  { id: 'published', label: 'Result Published' },
  { id: 'pending', label: 'Result Pending' },
];

function parseFilter(id) {
  if (id === 'free' || id === 'paid') return { accessType: id, status: 'all' };
  if (id === 'published' || id === 'pending') return { accessType: 'all', status: id };
  return { accessType: 'all', status: 'all' };
}

function emptyCopy(query) {
  if (query.accessType === 'paid') {
    return {
      title: 'No completed paid tests yet.',
      body: 'Independent paid examinations appear here after you complete them.',
      actionTo: '/paid-tests#paid-tests',
      actionLabel: 'Explore Paid Tests',
    };
  }
  if (query.accessType === 'free') {
    return {
      title: 'No completed free tests yet.',
      body: 'Completed free session attempts appear here after you confirm your account.',
      actionTo: '/paid-tests#free-tests',
      actionLabel: 'Explore Free Tests',
    };
  }
  if (query.status === 'published') {
    return {
      title: 'No published results yet.',
      body: 'Results appear here after the administrator releases them.',
      actionTo: '/paid-tests',
      actionLabel: 'Explore Tests',
    };
  }
  if (query.status === 'pending') {
    return {
      title: 'No pending results.',
      body: 'Submitted tests waiting for publication will appear here.',
      actionTo: '/paid-tests',
      actionLabel: 'Explore Tests',
    };
  }
  return {
    title: 'No matching standalone results',
    body: 'Try another filter, or browse the Tests page for available papers.',
    actionTo: '/paid-tests',
    actionLabel: 'Explore Tests',
  };
}

export default function MyTestsPage() {
  const loggedIn = Boolean(getStudentToken());
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [inProgressItems, setInProgressItems] = useState([]);
  const [totals, setTotals] = useState({ free: 0, paid: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, totalItems: 0, totalPages: 0 });
  const [loading, setLoading] = useState(loggedIn);
  const [error, setError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const query = useMemo(() => parseFilter(filter), [filter]);

  usePageSeo({
    title: 'My Results | MRB Classes',
    description: 'Private standalone test results.',
    noindex: true,
  });

  useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    const resultsRequest = standaloneTestsApi.myResults({
      page,
      pageSize: 10,
      search: debouncedSearch,
      accessType: query.accessType,
      status: query.status,
    });
    const inProgressRequest =
      query.status === 'all' && !debouncedSearch
        ? standaloneTestsApi.myResults({
            page: 1,
            pageSize: 20,
            accessType: query.accessType,
            status: 'in_progress',
          })
        : Promise.resolve(null);

    Promise.all([resultsRequest, inProgressRequest])
      .then(([res, inProgressRes]) => {
        if (cancelled) return;
        setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
        setPagination(res?.data?.pagination || { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 });
        setTotals({
          free: Number(res?.data?.totals?.free || 0),
          paid: Number(res?.data?.totals?.paid || 0),
        });
        setInProgressItems(Array.isArray(inProgressRes?.data?.items) ? inProgressRes.data.items : []);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = Number(err?.status || err?.response?.status);
        if (status === 401) {
          setError('sign_in');
          return;
        }
        setError('We could not load your results. Please try again.');
        setItems([]);
        setInProgressItems([]);
        setTotals({ free: 0, paid: 0 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loggedIn, page, debouncedSearch, query.accessType, query.status]);

  const freeItems = items.filter((item) => item.accessType === 'free_standalone');
  const paidItems = items.filter((item) => item.accessType === 'paid_standalone');
  const hasFilters = filter !== 'all' || Boolean(debouncedSearch);
  const emptyAll = !loading && !error && pagination.totalItems === 0 && !hasFilters && inProgressItems.length === 0;
  const showBothSections = query.accessType === 'all';
  const copy = emptyCopy(query);

  return (
    <PageLayout>
      <div className="my-tests">
        <section className="my-tests__hero">
          <div className="container">
            <span className="eyebrow">My Results</span>
            <h1 className="heading-1">My Results</h1>
            <p className="body-lg my-tests__lead">
              View your completed standalone tests and results.
            </p>
          </div>
        </section>

        <div className="container my-tests__body">
          {!loggedIn || error === 'sign_in' ? (
            <div className="my-tests__signin" role="status">
              <h2 className="heading-3">Sign in to view your test results.</h2>
              <p className="body-md">
                Standalone results stay with your student account. Course-linked tests remain in the
                student portal.
              </p>
              <Button as={Link} to={withSafeFromQuery('/login', MY_RESULTS_PATH)} variant="primary">
                Sign In
              </Button>
            </div>
          ) : (
            <>
              <div className="my-tests__toolbar">
                <div className="my-tests__filters" role="tablist" aria-label="Filter standalone results">
                  {FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === item.id}
                      className={`my-tests__chip${filter === item.id ? ' is-active' : ''}`}
                      onClick={() => {
                        setFilter(item.id);
                        setPage(1);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <label className="my-tests__search">
                  <span className="visually-hidden">Search by test name</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by test name"
                  />
                </label>
              </div>

              {error && error !== 'sign_in' ? (
                <p className="my-tests__error" role="alert">
                  {error}
                </p>
              ) : null}

              {loading ? (
                <div className="my-tests__grid">
                  {[0, 1, 2].map((i) => (
                    <MyTestRecordSkeleton key={i} />
                  ))}
                </div>
              ) : null}

              {emptyAll ? (
                <TestsEmptyState
                  title="You have not completed any standalone tests yet."
                  body="Start a free practice test, or register for an independent paid examination."
                  actionTo="/paid-tests#free-tests"
                  actionLabel="Explore Free Tests"
                />
              ) : null}

              {!loading && !error && !emptyAll && inProgressItems.length > 0 ? (
                <section className="my-tests__group" aria-labelledby="my-results-in-progress-heading">
                  <h2 id="my-results-in-progress-heading" className="heading-3">
                    In progress
                  </h2>
                  <div className="my-tests__grid">
                    {inProgressItems.map((item) => (
                      <MyTestRecordCard key={`progress-${item.attemptId}`} item={item} />
                    ))}
                  </div>
                </section>
              ) : null}

              {!loading && !error && !emptyAll && items.length === 0 && inProgressItems.length === 0 ? (
                <TestsEmptyState
                  title={copy.title}
                  body={copy.body}
                  actionTo={copy.actionTo}
                  actionLabel={copy.actionLabel}
                />
              ) : null}

              {!loading && !error && !emptyAll && (items.length > 0 || (showBothSections && (totals.free > 0 || totals.paid > 0))) ? (
                <>
                  {query.accessType !== 'paid' && (freeItems.length > 0 || (showBothSections && totals.free === 0)) ? (
                    <section className="my-tests__group" aria-labelledby="my-results-free-heading">
                      <h2 id="my-results-free-heading" className="heading-3">
                        Free Test Results
                      </h2>
                      {freeItems.length === 0 ? (
                        <p className="my-tests__category-empty">No completed free tests yet.</p>
                      ) : (
                        <div className="my-tests__grid">
                          {freeItems.map((item) => (
                            <MyTestRecordCard key={item.attemptId} item={item} />
                          ))}
                        </div>
                      )}
                    </section>
                  ) : null}

                  {query.accessType !== 'free' && (paidItems.length > 0 || (showBothSections && totals.paid === 0)) ? (
                    <section className="my-tests__group" aria-labelledby="my-results-paid-heading">
                      <h2 id="my-results-paid-heading" className="heading-3">
                        Paid Test Results
                      </h2>
                      {paidItems.length === 0 ? (
                        <p className="my-tests__category-empty">No completed paid tests yet.</p>
                      ) : (
                        <div className="my-tests__grid">
                          {paidItems.map((item) => (
                            <MyTestRecordCard key={item.attemptId} item={item} />
                          ))}
                        </div>
                      )}
                    </section>
                  ) : null}
                </>
              ) : null}

              {pagination.totalPages > 1 ? (
                <div className="my-tests__pager">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
