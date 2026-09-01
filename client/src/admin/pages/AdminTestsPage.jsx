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
import AdminSearchField from '../components/AdminSearchField';
import AdminSectionErrorBoundary from '../components/AdminSectionErrorBoundary';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminTestMobileCard from '../components/AdminTestMobileCard';
import TestsListTable from '../components/TestsListTable';
import TestsCourseIdTags from '../components/TestsCourseIdTags';
import TestPublishListModal from '../components/TestPublishListModal';
import { useAdminToast } from '../context/AdminToastContext';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import { isAnyPublishBusy, publishBusyKey } from '../utils/testPublishBusyState';
import {
  readAdminFiltersFromUrl,
  writeAdminFiltersToUrl,
} from '../utils/adminListFilterQuery.js';
import { getAuthSnapshot } from '../../auth/authStateMachine';
import '../styles/admin-tests-page-redesign.css';

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
    sortedCourses,
    isLoadingCourses,
  } = filterCascade;

  const [tests, setTests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [accessType, setAccessType] = useState('all');
  const [page, setPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [busyAction, setBusyAction] = useState('');
  const publishInFlightRef = useRef(null);
  const [publishModalTest, setPublishModalTest] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTestIds = useMemo(() => tests.map((test) => Number(test.id)), [tests]);
  const allSelected = pageTestIds.length > 0 && pageTestIds.every((id) => selectedIds.has(id));
  const someSelected = pageTestIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCourseId, selectedSubjectId, dateFrom, dateTo, accessType, sortBy, sortDirection]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage, debouncedSearch, selectedCourseId, selectedSubjectId, dateFrom, dateTo, accessType]);

  const loadTests = useCallback(async () => {
    const response = await adminApi.tests(token, {
      courseId: selectedCourseId || undefined,
      subjectId: selectedSubjectId || undefined,
      search: debouncedSearch || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      accessType: accessType !== 'all' ? accessType : undefined,
      sortBy,
      sortDirection,
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
    dateFrom,
    dateTo,
    accessType,
    sortBy,
    sortDirection,
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
    if (urlFilters.dateFrom) setDateFrom(urlFilters.dateFrom);
    if (urlFilters.dateTo) setDateTo(urlFilters.dateTo);
    if (urlFilters.accessType) setAccessType(urlFilters.accessType);
    if (urlFilters.page) setPage(Math.max(1, Number(urlFilters.page) || 1));
    if (urlFilters.sortBy) setSortBy(urlFilters.sortBy);
    if (urlFilters.sortDirection) setSortDirection(urlFilters.sortDirection);
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
        dateFrom,
        dateTo,
        accessType: accessType === 'all' ? '' : accessType,
        page: String(currentPage),
        sortBy: sortBy === 'updated_at' ? '' : sortBy,
        sortDirection: sortDirection === 'desc' ? '' : sortDirection,
      }),
      { replace: true }
    );
  }, [
    selectedCourseId,
    selectedSubjectId,
    searchQuery,
    dateFrom,
    dateTo,
    accessType,
    currentPage,
    sortBy,
    sortDirection,
    setSearchParams,
  ]);

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

  function toggleRowSelection(testId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  }

  function toggleAllOnPage(checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageTestIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  async function removeTest(test) {
    const testId = test.id;
    const name = String(test.title || '').trim() || `Test #${testId}`;

    setBusyAction('delete');
    try {
      await adminApi.deleteTest(token, testId);
      toast.success(`Deleted "${name}".`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(Number(testId));
        return next;
      });
      setDeleteTarget(null);
      await loadTests();
    } catch (err) {
      toast.error(err.message || 'Could not delete this test. It was not removed.');
    } finally {
      setBusyAction('');
    }
  }

  async function bulkDeleteSelected() {
    const selectedTests = tests.filter((test) => selectedIds.has(Number(test.id)));
    const deletable = selectedTests.filter((test) => !isTestPublishedStatus(test.status));
    if (!deletable.length) {
      toast.error('Only unpublished tests can be deleted. Deselect published tests.');
      setBulkDeleteOpen(false);
      return;
    }

    setBusyAction('bulk-delete');
    try {
      for (const test of deletable) {
        await adminApi.deleteTest(token, test.id);
      }
      toast.success(`Deleted ${deletable.length} test${deletable.length === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      await loadTests();
    } catch (err) {
      toast.error(err.message || 'Could not delete the selected tests.');
    } finally {
      setBusyAction('');
    }
  }

  function openPublishModal(test) {
    if (publishInFlightRef.current || isAnyPublishBusy(busyAction)) return;
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
      toast.success(
        tests.find((row) => row.publicLink === link)?.testAccessType === 'free_standalone'
          ? 'Test link copied'
          : 'Public link copied to clipboard.'
      );
    } catch {
      toast.error('Could not copy link to clipboard.');
    }
  }

  async function duplicateExistingTest(testId) {
    const source = tests.find((row) => Number(row.id) === Number(testId));
    setBusyAction(`duplicate-${testId}`);
    try {
      await adminApi.duplicateTest(token, testId);
      toast.success(
        source?.testAccessType === 'paid_standalone'
          ? 'Test duplicated as a draft copy. Set price and seat capacity on the new test.'
          : 'Test duplicated as draft copy.'
      );
      await loadTests();
    } catch (err) {
      toast.error(err.message || 'Failed to duplicate test');
    } finally {
      setBusyAction('');
    }
  }

  async function downloadResults(testId) {
    const authState = getAuthSnapshot();
    if (authState.status !== 'authenticated') {
      toast.error('Session expired, login again');
      return;
    }
    const actionKey = `results-${testId}-xlsx`;
    setBusyAction(actionKey);
    try {
      const { blob, filename } = await adminApi.exportTestResults(token, testId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `test-${testId}-results.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Results download started.');
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
    return Boolean(selectedCourseId || selectedSubjectId || debouncedSearch || dateFrom || dateTo || (accessType && accessType !== 'all'));
  }

  const showEmpty = !isLoading && listTotal === 0 && !hasActiveListFilters();
  const showFilteredEmpty = !isLoading && listTotal === 0 && hasActiveListFilters();

  function clearAllFilters() {
    selectCourse('');
    selectSubject('');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setAccessType('all');
    setPage(1);
  }

  function handleCourseTagSelect(courseId) {
    selectCourse(courseId);
    if (!courseId) selectSubject('');
    setPage(1);
  }

  function handleSortChange(next) {
    setSortBy(next.sortBy);
    setSortDirection(next.sortDirection);
  }

  const selectedCount = selectedIds.size;

  return (
    <section className="admin-page admin-page--tests tests-page">
      <header className="tests-page__header">
        <div className="tests-page__header-main">
          <h1 className="tests-page__title">Tests</h1>
          <p className="tests-page__description">
            Manage course-linked, free standalone, and paid standalone tests. Open a title to edit,
            publish, or review results.
          </p>
        </div>
        <div className="tests-page__header-actions">
          <Link className="tests-page__btn tests-page__btn--primary" to={adminRoute('tests/new')}>
            <AddIcon fontSize="inherit" aria-hidden />
            Create new test
          </Link>
          <Link className="tests-page__btn tests-page__btn--secondary" to={adminRoute('tests/import')}>
            <FileUploadIcon fontSize="inherit" aria-hidden />
            Import test
          </Link>
        </div>
      </header>

      <section className="tests-page__management">
        <div className="tests-filters">
          <div className="tests-filters__block">
            <p className="tests-filters__block-label">Filters</p>
            <div className="tests-filters__primary-grid">
              <AdminHierarchySelectors
                cascade={filterCascade}
                depth={2}
                hideCourse
                idPrefix={{ course: 'testsCourse', subject: 'testsSubject' }}
              />
              <div className="admin-field">
                <label htmlFor="testsAccessType">Test type</label>
                <select
                  id="testsAccessType"
                  value={accessType}
                  onChange={(e) => setAccessType(e.target.value)}
                >
                  <option value="all">All types</option>
                  <option value="course_locked">Course-linked</option>
                  <option value="free_standalone">Free standalone</option>
                  <option value="paid_standalone">Paid standalone</option>
                </select>
              </div>
              <div className="admin-field">
                <label htmlFor="testsDateFrom">Created from</label>
                <input id="testsDateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="admin-field">
                <label htmlFor="testsDateTo">Created to</label>
                <input id="testsDateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>

          <TestsCourseIdTags
            courses={sortedCourses}
            selectedCourseId={selectedCourseId}
            onSelectCourse={handleCourseTagSelect}
            isLoading={isLoadingCourses}
            searchControl={
              <AdminSearchField
                id="tests-search"
                label="Search tests"
                placeholder="Search tests…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery('')}
              />
            }
          />
        </div>

        {selectedCount > 0 ? (
          <div className="tests-bulk-bar" aria-live="polite">
            <span className="tests-bulk-bar__count">
              {selectedCount} selected
            </span>
            <div className="tests-bulk-bar__actions">
              <button
                type="button"
                className="tests-page__btn tests-page__btn--secondary"
                disabled={busyAction === 'bulk-delete'}
                onClick={() => setBulkDeleteOpen(true)}
              >
                {busyAction === 'bulk-delete' ? 'Deleting…' : 'Delete selected'}
              </button>
            </div>
          </div>
        ) : null}

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
            <button type="button" className="tests-page__btn tests-page__btn--secondary" onClick={clearAllFilters}>
              Clear filters
            </button>
          </div>
        ) : showEmpty ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">No tests available</p>
            <p className="admin-empty-state__text">Create your first test to get started.</p>
            <Link className="tests-page__btn tests-page__btn--primary" to={adminRoute('tests/new')}>
              Create new test
            </Link>
          </div>
        ) : (
          <>
            <div className="admin-tests-table-desktop">
              <TestsListTable
                tests={tests}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
                selectedIds={selectedIds}
                onToggleRow={toggleRowSelection}
                onToggleAll={toggleAllOnPage}
                allSelected={allSelected}
                someSelected={someSelected}
                onPublish={handlePublishModalOpen}
                onDuplicate={duplicateExistingTest}
                onDownloadResults={downloadResults}
                onExportTest={exportTestDefinition}
                onDelete={setDeleteTarget}
                onCopyLink={copyPublicLink}
                busyAction={busyAction}
              />
            </div>

            <div className="admin-tests-mobile-list">
              {tests.map((test) => (
                <AdminTestMobileCard
                  key={test.id}
                  test={test}
                  onPublish={handlePublishModalOpen}
                  onDuplicate={duplicateExistingTest}
                  onDownloadResults={downloadResults}
                  onExportTest={exportTestDefinition}
                  onDelete={setDeleteTarget}
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
                    className="tests-page__btn tests-page__btn--secondary"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="tests-page__btn tests-page__btn--secondary"
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

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this test?"
        message={`This permanently removes "${String(deleteTarget?.title || '').trim() || `Test #${deleteTarget?.id}`}" and all linked data. This cannot be undone.`}
        confirmLabel="Delete test"
        cancelLabel="Cancel"
        danger
        busy={busyAction === 'delete'}
        onConfirm={() => deleteTarget && removeTest(deleteTarget)}
        onCancel={() => {
          if (busyAction === 'delete') return;
          setDeleteTarget(null);
        }}
      />

      <AdminConfirmDialog
        open={bulkDeleteOpen}
        title="Delete selected tests?"
        message="Only unpublished tests in this selection will be deleted. Published tests are skipped. This cannot be undone."
        confirmLabel="Delete unpublished tests"
        cancelLabel="Cancel"
        danger
        busy={busyAction === 'bulk-delete'}
        onConfirm={bulkDeleteSelected}
        onCancel={() => {
          if (busyAction === 'bulk-delete') return;
          setBulkDeleteOpen(false);
        }}
      />
    </section>
  );
}
