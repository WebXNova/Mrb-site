import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { Link, useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import AdminHierarchySelectors from '../../components/admin/AdminHierarchySelectors';
import { useAdminHierarchyCascade } from '../../components/admin/useAdminHierarchyCascade';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminCollapsibleCard from '../components/AdminCollapsibleCard';
import AdminSearchField from '../components/AdminSearchField';
import AdminSectionErrorBoundary from '../components/AdminSectionErrorBoundary';
import AdminTestMobileCard from '../components/AdminTestMobileCard';
import TestRowActionsMenu from '../components/TestRowActionsMenu';
import TestPublishListModal from '../components/TestPublishListModal';
import TestStatusBadge from '../components/TestStatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import { TEST_STATUS_FILTERS } from '../utils/testListFilters';
import { isAnyPublishBusy, publishBusyKey } from '../utils/testPublishBusyState';
import {
  readAdminFiltersFromUrl,
  writeAdminFiltersToUrl,
} from '../utils/adminListFilterQuery.js';
import { getAuthSnapshot } from '../../auth/authStateMachine';
import AdminTestResultsAnalyticsPanel from '../components/AdminTestResultsAnalyticsPanel';
import '../styles/admin-courses-dashboard.css';
import '../styles/admin-test-results-analytics.css';

const PAGE_SIZE = 10;

export default function AdminTestsPage() {
  return (
    <AdminSectionErrorBoundary title="Test management could not load">
      <AdminTestsPageContent />
    </AdminSectionErrorBoundary>
  );
}

function AdminTestsPageContent() {
  const token = getAdminToken();
  const toast = useAdminToast();
  const toastErrorRef = useRef(toast.error);
  toastErrorRef.current = toast.error;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlHydratedRef = useRef(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const filterCascade = useAdminHierarchyCascade({ token, depth: 2 });
  const {
    selectedCourseId,
    selectedSubjectId,
    selectCourse,
    selectSubject,
    applyHierarchySelection,
  } = filterCascade;

  const [tests, setTests] = useState([]);
  const [statsTests, setStatsTests] = useState([]);
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [busyAction, setBusyAction] = useState('');
  const publishInFlightRef = useRef(null);
  const [publishModalTest, setPublishModalTest] = useState(null);
  const [workflowExpanded, setWorkflowExpanded] = useLocalStorageState('admin.tests.workflowExpanded', false);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const courseTitleById = useMemo(() => {
    const map = new Map();
    courses.forEach((course) => map.set(Number(course.id), course.title || `Course #${course.id}`));
    return map;
  }, [courses]);

  const publishedCount = statsTests.filter((test) => isTestPublishedStatus(test.status)).length;
  const draftsCount = statsTests.length - publishedCount;

  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const paginatedTests = tests;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, selectedCourseId, selectedSubjectId, dateFrom, dateTo]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const loadTests = useCallback(async () => {
    const response = await adminApi.tests(token, {
      courseId: selectedCourseId || undefined,
      subjectId: selectedSubjectId || undefined,
      search: debouncedSearch || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: PAGE_SIZE,
      offset: (currentPage - 1) * PAGE_SIZE,
    });
    const payload = response?.data;
    if (payload && Array.isArray(payload.items)) {
      setTests(payload.items);
      setListTotal(Number(payload.total ?? payload.items.length));
      return;
    }
    const rows = Array.isArray(payload) ? payload : [];
    setTests(rows);
    setListTotal(rows.length);
  }, [
    token,
    selectedCourseId,
    selectedSubjectId,
    debouncedSearch,
    statusFilter,
    dateFrom,
    dateTo,
    currentPage,
  ]);

  useEffect(() => {
    if (urlHydratedRef.current) return;
    const urlFilters = readAdminFiltersFromUrl(searchParams);
    if (urlFilters.courseId || urlFilters.subjectId) {
      applyHierarchySelection({
        courseId: urlFilters.courseId,
        subjectId: urlFilters.subjectId,
      });
    }
    if (urlFilters.search) setSearchQuery(urlFilters.search);
    if (urlFilters.status && urlFilters.status !== 'all') setStatusFilter(urlFilters.status);
    if (urlFilters.dateFrom) setDateFrom(urlFilters.dateFrom);
    if (urlFilters.dateTo) setDateTo(urlFilters.dateTo);
    if (urlFilters.page) setPage(Math.max(1, Number(urlFilters.page) || 1));
    urlHydratedRef.current = true;
    setFiltersReady(true);
  }, [searchParams, applyHierarchySelection]);

  useEffect(() => {
    if (!urlHydratedRef.current) return;
    setSearchParams(
      writeAdminFiltersToUrl(new URLSearchParams(), {
        courseId: selectedCourseId,
        subjectId: selectedSubjectId,
        search: searchQuery,
        status: statusFilter,
        dateFrom,
        dateTo,
        page: String(currentPage),
      }),
      { replace: true }
    );
  }, [
    selectedCourseId,
    selectedSubjectId,
    searchQuery,
    statusFilter,
    dateFrom,
    dateTo,
    currentPage,
    setSearchParams,
  ]);

  useEffect(() => {
    adminApi.courses(token).then((response) => setCourses(Array.isArray(response?.data) ? response.data : [])).catch(() => {});
    adminApi
      .tests(token)
      .then((response) => {
        const payload = response?.data;
        setStatsTests(Array.isArray(payload) ? payload : payload?.items ?? []);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!filtersReady) return undefined;
    let cancelled = false;
    setIsLoading(true);
    setListError('');
    loadTests()
      .catch((err) => {
        const message = err.message || 'Failed to load tests';
        setListError(message);
        toastErrorRef.current(message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadTests, filtersReady]);

  async function removeTest(test) {
    const testId = test.id;
    const name = String(test.title || '').trim() || `Test #${testId}`;
    const confirmed = window.confirm(
      `Delete "${name}"?\n\nThis permanently removes the test and all linked data. This action cannot be undone.`
    );
    if (!confirmed) return;

    setBusyAction('delete');
    try {
      await adminApi.deleteTest(token, testId);
      toast.success(`Deleted "${name}".`);
      await loadTests();
    } catch (err) {
      toast.error(err.message || 'Failed to delete test');
    } finally {
      setBusyAction('');
    }
  }

  function openPublishModal(test) {
    if (publishInFlightRef.current || isAnyPublishBusy(busyAction)) {
      return;
    }
    setPublishModalTest(test);
  }

  function closePublishModal() {
    if (isAnyPublishBusy(busyAction)) return;
    setPublishModalTest(null);
  }

  async function handlePublishedFromModal() {
    await loadTests();
    setBusyAction('');
    publishInFlightRef.current = null;
    setPublishModalTest(null);
  }

  function handlePublishModalOpen(testId) {
    const test = tests.find((row) => Number(row.id) === Number(testId));
    if (test) openPublishModal(test);
  }

  function handlePublishBusyChange(isPublishing, testId) {
    if (isPublishing) {
      const actionKey = publishBusyKey(testId);
      publishInFlightRef.current = actionKey;
      setBusyAction(actionKey);
      return;
    }
    publishInFlightRef.current = null;
    setBusyAction('');
  }

  async function copyPublicLink(link) {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Public link copied to clipboard.');
    } catch {
      toast.error('Could not copy link to clipboard.');
    }
  }

  async function duplicateExistingTest(testId) {
    setBusyAction(`duplicate-${testId}`);
    try {
      await adminApi.duplicateTest(token, testId);
      toast.success('Test duplicated as draft copy.');
      await loadTests();
    } catch (err) {
      toast.error(err.message || 'Failed to duplicate test');
    } finally {
      setBusyAction('');
    }
  }

  async function downloadResults(testId, format = 'xlsx') {
    const authState = getAuthSnapshot();
    if (authState.status !== 'authenticated') {
      toast.error('Session expired, login again');
      return;
    }
    const actionKey = `results-${testId}-${format}`;
    setBusyAction(actionKey);
    try {
      const { blob, filename } = await adminApi.exportTestResults(token, testId, format);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `test-${testId}-results.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Results download started (${format.toUpperCase()}).`);
    } catch (err) {
      toast.error(err.message || 'Failed to download results');
    } finally {
      setBusyAction('');
    }
  }

  async function exportTestDefinition(testId) {
    const authState = getAuthSnapshot();
    if (authState.status !== 'authenticated') {
      toast.error('Session expired, login again');
      return;
    }
    const actionKey = `export-csv-${testId}`;
    setBusyAction(actionKey);
    try {
      const { blob, filename } = await adminApi.exportTest(token, testId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `test-${testId}-export.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV export download started.');
    } catch (err) {
      toast.error(err.message || 'Failed to export test as CSV');
    } finally {
      setBusyAction('');
    }
  }

  function hasActiveListFilters() {
    return Boolean(
      selectedCourseId ||
        selectedSubjectId ||
        debouncedSearch ||
        statusFilter !== 'all' ||
        dateFrom ||
        dateTo
    );
  }

  const showEmpty = !isLoading && listTotal === 0 && !hasActiveListFilters();
  const showFilteredEmpty = !isLoading && listTotal === 0 && hasActiveListFilters();

  function clearAllFilters() {
    selectCourse('');
    selectSubject('');
    setSearchQuery('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  return (
    <section className="admin-page admin-page--tests">
      <header className="admin-courses-page-header">
        <div>
          <h1 className="admin-courses-page-header__title">Test management</h1>
          <p className="admin-courses-page-header__subtitle">
            Create, publish, and maintain assessments. Use the list below to find tests or start a new one with the
            guided builder.
          </p>
        </div>
        <div className="admin-courses-page-header__actions">
          <Link className="btn btn--secondary admin-touch-target" to={adminRoute('tests/transfer')}>
            Export / import history
          </Link>
          <Link className="btn btn--secondary admin-touch-target" to={adminRoute('tests/import')}>
            <FileUploadIcon fontSize="small" style={{ marginRight: 6, verticalAlign: -3 }} aria-hidden />
            Import test
          </Link>
          <Link className="btn--course-primary admin-touch-target" to={adminRoute('tests/new')}>
            <AddIcon fontSize="small" style={{ marginRight: 6, verticalAlign: -3 }} aria-hidden />
            New test
          </Link>
        </div>
      </header>

      <section className="admin-grid" aria-busy={isLoading}>
        {isLoading ? (
          <>
            <div className="admin-skeleton admin-skeleton-card" />
            <div className="admin-skeleton admin-skeleton-card" />
            <div className="admin-skeleton admin-skeleton-card" />
          </>
        ) : (
          <>
            <article className="admin-stat-card">
              <p className="admin-stat-card__label">Total Tests</p>
              <p className="admin-stat-card__value">{statsTests.length}</p>
            </article>
            <article className="admin-stat-card">
              <p className="admin-stat-card__label">Published</p>
              <p className="admin-stat-card__value">{publishedCount}</p>
            </article>
            <article className="admin-stat-card">
              <p className="admin-stat-card__label">Drafts</p>
              <p className="admin-stat-card__value">{draftsCount}</p>
            </article>
          </>
        )}
      </section>

      <AdminSectionErrorBoundary title="Test results analytics could not load">
        <AdminTestResultsAnalyticsPanel tests={statsTests} />
      </AdminSectionErrorBoundary>

      <AdminCollapsibleCard
        title="Test builder workflow"
        className="admin-card admin-tests-workflow"
        expanded={workflowExpanded}
        onToggle={() => setWorkflowExpanded((v) => !v)}
      >
        <ol className="admin-workflow-list">
          <li>
            <strong>Create:</strong> <Link to={adminRoute('tests/new')}>New test</Link> — basic info, then rules, settings, and
            questions.
          </li>
          <li>
            <strong>Maintain:</strong> Use <strong>Edit</strong>, <strong>Questions</strong>, or <strong>More</strong> on
            each row.
          </li>
          <li>
            <strong>Publish:</strong> When all steps show complete, use <strong>Publish test</strong> on the
            Questions/Settings page or <strong>More → Publish</strong> here. Public access mode alone does not
            publish.
          </li>
        </ol>
      </AdminCollapsibleCard>

      <section className="admin-card">
        <div className="admin-tests-list-head">
          <h2 className="heading-3">All tests</h2>
        </div>

        <div className="admin-form-grid" style={{ marginBottom: '1rem' }}>
          <AdminHierarchySelectors cascade={filterCascade} depth={2} idPrefix={{ course: 'testsCourse', subject: 'testsSubject' }} />
          <div className="admin-field">
            <label htmlFor="testsDateFrom">Start date</label>
            <input
              id="testsDateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="testsDateTo">End date</label>
            <input id="testsDateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="admin-tests-toolbar">
          <AdminSearchField
            id="tests-search"
            label="Search tests"
            placeholder="Search tests…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />

          <Link className="btn btn--secondary admin-touch-target" to={adminRoute('tests/import')}>
            <FileUploadIcon fontSize="small" style={{ marginRight: 6, verticalAlign: -3 }} aria-hidden />
            Import test
          </Link>

          <div className="admin-status-filters" role="tablist" aria-label="Filter tests by status">
            {TEST_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === filter.key}
                className={`admin-tag-chip ${statusFilter === filter.key ? 'admin-tag-chip--active' : ''}`}
                onClick={() => setStatusFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {listError ? <p className="admin-error">{listError}</p> : null}

        {isLoading ? (
          <div aria-hidden>
            <div className="admin-skeleton admin-skeleton-row" />
            <div className="admin-skeleton admin-skeleton-row" />
            <div className="admin-skeleton admin-skeleton-row" />
          </div>
        ) : showFilteredEmpty ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">No tests match your search</p>
            <p className="admin-empty-state__text">Try a different keyword or clear filters.</p>
            <button type="button" className="btn btn--secondary admin-touch-target" onClick={clearAllFilters}>
              Clear filters
            </button>
          </div>
        ) : showEmpty ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">No tests available</p>
            <p className="admin-empty-state__text">Create your first test to get started.</p>
            <Link className="btn btn--primary admin-touch-target" to={adminRoute('tests/new')}>
              Create test
            </Link>
          </div>
        ) : (
          <>
            <div className="admin-tests-table-wrap admin-tests-table-desktop">
              <div className="admin-tests-table-scroll">
                <table className="admin-tests-table">
                  <thead className="admin-tests-table__head--sticky">
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">Course</th>
                      <th scope="col">Category</th>
                      <th scope="col">Status</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Public link</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTests.map((test) => (
                      <tr key={test.id}>
                        <td data-label="Title">
                          <div className="admin-tests-table__title">{test.title}</div>
                        </td>
                        <td data-label="Course">
                          {test.courseId ? courseTitleById.get(Number(test.courseId)) || `Course #${test.courseId}` : '—'}
                        </td>
                        <td data-label="Category">{test.category || 'MDCAT'}</td>
                        <td data-label="Status">
                          <TestStatusBadge status={test.status} />
                        </td>
                        <td data-label="Duration">
                          {test.durationMinutes != null ? `${test.durationMinutes} min` : '—'}
                        </td>
                        <td data-label="Public link">
                          {test.publicLink ? (
                            <div className="admin-tests-link-actions">
                              <a href={test.publicLink} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm admin-touch-target">
                                Open
                              </a>
                              <button className="btn btn--ghost btn--sm admin-touch-target" type="button" onClick={() => copyPublicLink(test.publicLink)}>
                                Copy
                              </button>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td data-label="Actions">
                          <TestRowActionsMenu
                            test={test}
                            onPublish={handlePublishModalOpen}
                            onDuplicate={duplicateExistingTest}
                            onDownloadResults={downloadResults}
                            onExportTest={exportTestDefinition}
                            onDelete={removeTest}
                            onCopyLink={copyPublicLink}
                            busyAction={busyAction}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-tests-mobile-list">
              {paginatedTests.map((test) => (
                <AdminTestMobileCard
                  key={test.id}
                  test={test}
                  courseTitle={test.courseId ? courseTitleById.get(Number(test.courseId)) : ''}
                  onPublish={handlePublishModalOpen}
                  onDuplicate={duplicateExistingTest}
                  onDownloadResults={downloadResults}
                  onExportTest={exportTestDefinition}
                  onDelete={removeTest}
                  onCopyLink={copyPublicLink}
                  busyAction={busyAction}
                />
              ))}
            </div>

            {listTotal > PAGE_SIZE ? (
              <nav className="admin-pagination" aria-label="Tests pagination">
                <p className="admin-pagination__info">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, listTotal)} of{' '}
                  {listTotal}
                </p>
                <div className="admin-pagination__controls">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm admin-touch-target"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm admin-touch-target"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </nav>
            ) : null}
          </>
        )}
      </section>

      <TestPublishListModal
        testId={publishModalTest?.id}
        testTitle={publishModalTest?.title}
        open={Boolean(publishModalTest)}
        onClose={closePublishModal}
        onPublished={handlePublishedFromModal}
        onBusyChange={handlePublishBusyChange}
      />
    </section>
  );
}
