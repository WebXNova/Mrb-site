import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminCollapsibleCard from '../components/AdminCollapsibleCard';
import AdminSearchField from '../components/AdminSearchField';
import AdminTestMobileCard from '../components/AdminTestMobileCard';
import TestRowActionsMenu from '../components/TestRowActionsMenu';
import TestStatusBadge from '../components/TestStatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import { TEST_STATUS_FILTERS, filterTestsList } from '../utils/testListFilters';

const PAGE_SIZE = 10;

export default function AdminTestsPage() {
  const token = getAdminToken();
  const toast = useAdminToast();
  const [tests, setTests] = useState([]);
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [busyAction, setBusyAction] = useState('');
  const [workflowExpanded, setWorkflowExpanded] = useLocalStorageState('admin.tests.workflowExpanded', true);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const courseTitleById = useMemo(() => {
    const map = new Map();
    courses.forEach((course) => map.set(Number(course.id), course.title || `Course #${course.id}`));
    return map;
  }, [courses]);

  const filteredTests = useMemo(
    () =>
      filterTestsList(tests, {
        search: debouncedSearch,
        statusFilter,
        courseTitleById,
      }),
    [tests, debouncedSearch, statusFilter, courseTitleById]
  );

  const publishedCount = tests.filter((test) => isTestPublishedStatus(test.status)).length;
  const draftsCount = tests.length - publishedCount;

  const totalPages = Math.max(1, Math.ceil(filteredTests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const paginatedTests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTests.slice(start, start + PAGE_SIZE);
  }, [filteredTests, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function loadTests() {
    const response = await adminApi.tests(token);
    setTests(response?.data || []);
  }

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      loadTests(),
      adminApi.courses(token).then((response) => setCourses(Array.isArray(response?.data) ? response.data : [])),
    ])
      .catch((err) => toast.error(err.message || 'Failed to load tests'))
      .finally(() => setIsLoading(false));
  }, []);

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

  async function publish(testId) {
    setBusyAction(`publish-${testId}`);
    try {
      const completenessResponse = await adminApi.getTestCompleteness(token, testId);
      const report = completenessResponse?.data;
      if (!report?.can_publish) {
        const missing = Array.isArray(report?.missing_fields) ? report.missing_fields.join(', ') : 'required fields';
        toast.error(`Cannot publish — incomplete. Missing: ${missing}`);
        return;
      }

      const response = await adminApi.publishTest(token, testId);
      const link = response?.data?.publicLink;
      toast.success(link ? `Test published. Public link ready.` : 'Test published successfully.');
      await loadTests();
    } catch (err) {
      toast.error(err.message || 'Failed to publish test');
    } finally {
      setBusyAction('');
    }
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

  async function downloadResults(testId) {
    setBusyAction(`results-${testId}`);
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

  const showEmpty = !isLoading && filteredTests.length === 0;
  const showFilteredEmpty = !isLoading && tests.length > 0 && filteredTests.length === 0;

  return (
    <section className="admin-page admin-page--tests">
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
              <p className="admin-stat-card__value">{tests.length}</p>
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

      <AdminCollapsibleCard
        title="Test builder workflow"
        className="admin-card admin-tests-workflow"
        expanded={workflowExpanded}
        onToggle={() => setWorkflowExpanded((v) => !v)}
      >
        <ol className="admin-workflow-list">
          <li>
            <strong>Create:</strong> <Link to="/admin/tests/new">New test</Link> — basic info, then rules, settings, and
            questions.
          </li>
          <li>
            <strong>Maintain:</strong> Use <strong>Edit</strong>, <strong>Questions</strong>, or <strong>More</strong> on
            each row.
          </li>
          <li>
            <strong>Publish:</strong> When all steps show complete, publish from the row actions menu.
          </li>
        </ol>
      </AdminCollapsibleCard>

      <section className="admin-card">
        <div className="admin-tests-list-head">
          <h2 className="heading-3">All tests</h2>
          <Link className="btn btn--primary admin-touch-target" to="/admin/tests/new">
            Create test
          </Link>
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
            <button type="button" className="btn btn--secondary admin-touch-target" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
              Clear filters
            </button>
          </div>
        ) : showEmpty ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">No tests available</p>
            <p className="admin-empty-state__text">Create your first test to get started.</p>
            <Link className="btn btn--primary admin-touch-target" to="/admin/tests/new">
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
                            onPublish={publish}
                            onDuplicate={duplicateExistingTest}
                            onDownloadResults={downloadResults}
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
                  onPublish={publish}
                  onDuplicate={duplicateExistingTest}
                  onDownloadResults={downloadResults}
                  onDelete={removeTest}
                  onCopyLink={copyPublicLink}
                />
              ))}
            </div>

            {filteredTests.length > PAGE_SIZE ? (
              <nav className="admin-pagination" aria-label="Tests pagination">
                <p className="admin-pagination__info">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredTests.length)} of{' '}
                  {filteredTests.length}
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
    </section>
  );
}
