import { useEffect, useMemo, useRef, useState } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { Link } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import { safeAdminErrorMessage } from '../../components/admin/adminSafeMessages';
import AdminLoadingButton from '../components/AdminLoadingButton';
import AdminSearchField from '../components/AdminSearchField';
import { QUESTION_DIFFICULTY_OPTIONS } from '../constants/questionBank.constants';
import { useAdminToast } from '../context/AdminToastContext';
import { useCourseSubjects } from '../hooks/useCourseSubjects';
import {
  difficultyLabel,
  downloadTextFile,
  previewQuestionText,
} from '../utils/questionBankListUtils';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import '../styles/admin-question-bank.css';

const PAGE_SIZE = 20;

function formatRange(page, limit, total) {
  if (!total) return 'No questions';
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return `Showing ${start}–${end} of ${total}`;
}

export default function AdminQuestionBankPage() {
  const token = getAdminToken();
  const toast = useAdminToast();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, total_pages: 0 });
  const [courses, setCourses] = useState([]);
  const [tests, setTests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchTopic, setSearchTopic] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTestId, setAssignTestId] = useState('');

  const debouncedSearchText = useDebouncedValue(searchText, 300);
  const debouncedSearchTopic = useDebouncedValue(searchTopic, 300);
  const fetchSeq = useRef(0);

  const { subjects, isLoading: isLoadingSubjects } = useCourseSubjects(token, courseFilter);

  const courseTitleById = useMemo(() => {
    const map = new Map();
    courses.forEach((course) => map.set(Number(course.id), course.title || `Course #${course.id}`));
    return map;
  }, [courses]);

  const subjectTitleById = useMemo(() => {
    const map = new Map();
    subjects.forEach((subject) => map.set(Number(subject.id), subject.title || subject.name || `Subject #${subject.id}`));
    return map;
  }, [subjects]);

  const draftTests = useMemo(
    () => tests.filter((test) => !isTestPublishedStatus(test.status)),
    [tests]
  );

  const hasActiveFilters = Boolean(
    debouncedSearchText.trim() ||
      debouncedSearchTopic.trim() ||
      courseFilter ||
      subjectFilter ||
      difficultyFilter
  );

  const totalPages = Math.max(1, pagination.total_pages || 1);
  const currentPage = Math.min(page, totalPages);
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.has(item.question_id));
  const selectedCount = selectedIds.size;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchText, debouncedSearchTopic, courseFilter, subjectFilter, difficultyFilter]);

  useEffect(() => {
    setSubjectFilter('');
  }, [courseFilter]);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .courses(token)
      .then((response) => {
        if (cancelled) return;
        setCourses(Array.isArray(response?.data) ? response.data : []);
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      });
    adminApi
      .tests(token)
      .then((response) => {
        if (cancelled) return;
        setTests(Array.isArray(response?.data) ? response.data : []);
      })
      .catch(() => {
        if (!cancelled) setTests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const seq = ++fetchSeq.current;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');

    adminApi
      .listQuestions(
        token,
        {
          page: currentPage,
          limit: PAGE_SIZE,
          search: debouncedSearchText.trim() || undefined,
          topic: debouncedSearchTopic.trim() || undefined,
          course_id: courseFilter || undefined,
          subject_id: subjectFilter || undefined,
          difficulty: difficultyFilter || undefined,
        },
        { signal: controller.signal }
      )
      .then((response) => {
        if (seq !== fetchSeq.current) return;
        const data = response?.data || {};
        setItems(Array.isArray(data.items) ? data.items : []);
        setPagination(data.pagination || { page: currentPage, limit: PAGE_SIZE, total: 0, total_pages: 0 });
      })
      .catch((err) => {
        if (seq !== fetchSeq.current || err?.name === 'AbortError') return;
        setItems([]);
        setPagination({ page: 1, limit: PAGE_SIZE, total: 0, total_pages: 0 });
        setLoadError(safeAdminErrorMessage(err, 'Could not load questions.'));
      })
      .finally(() => {
        if (seq === fetchSeq.current) setIsLoading(false);
      });

    return () => controller.abort();
  }, [
    token,
    currentPage,
    debouncedSearchText,
    debouncedSearchTopic,
    courseFilter,
    subjectFilter,
    difficultyFilter,
  ]);

  function clearFilters() {
    setSearchText('');
    setSearchTopic('');
    setCourseFilter('');
    setSubjectFilter('');
    setDifficultyFilter('');
  }

  function toggleRow(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        items.forEach((item) => next.delete(item.question_id));
      } else {
        items.forEach((item) => next.add(item.question_id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function refreshList() {
    const response = await adminApi.listQuestions(token, {
      page: currentPage,
      limit: PAGE_SIZE,
      search: debouncedSearchText.trim() || undefined,
      topic: debouncedSearchTopic.trim() || undefined,
      course_id: courseFilter || undefined,
      subject_id: subjectFilter || undefined,
      difficulty: difficultyFilter || undefined,
    });
    const data = response?.data || {};
    setItems(Array.isArray(data.items) ? data.items : []);
    setPagination(data.pagination || pagination);
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const confirmed = window.confirm(
      `Delete ${ids.length} question${ids.length === 1 ? '' : 's'}?\n\nThis soft-deletes them from the bank. Questions linked to published tests may be blocked.`
    );
    if (!confirmed) return;

    setBulkAction('delete');
    try {
      const response = await adminApi.bulkDeleteQuestions(token, ids);
      const result = response?.data || {};
      const deleted = Number(result.deleted_count || 0);
      const failed = Number(result.failed_count || 0);
      if (deleted > 0) {
        toast.success(`Deleted ${deleted} question${deleted === 1 ? '' : 's'}.`);
      }
      if (failed > 0) {
        toast.error(`${failed} question${failed === 1 ? '' : 's'} could not be deleted.`);
      }
      clearSelection();
      await refreshList();
    } catch (err) {
      toast.error(safeAdminErrorMessage(err, 'Bulk delete failed.'));
    } finally {
      setBulkAction('');
    }
  }

  async function handleBulkExport() {
    const ids = [...selectedIds];
    if (!ids.length) return;

    setBulkAction('export');
    try {
      const response = await adminApi.bulkExportQuestions(token, ids);
      const result = response?.data || {};
      if (!result.content) {
        toast.error('Export returned no content.');
        return;
      }
      downloadTextFile(result.content, result.file_name || 'question-bank-export.aiken');
      toast.success(`Exported ${result.exported_count || ids.length} question${ids.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(safeAdminErrorMessage(err, 'Export failed.'));
    } finally {
      setBulkAction('');
    }
  }

  async function handleBulkAssign() {
    const ids = [...selectedIds];
    const testId = Number(assignTestId);
    if (!ids.length || !Number.isInteger(testId) || testId <= 0) return;

    setBulkAction('assign');
    try {
      const response = await adminApi.bulkAssignQuestionsToTest(token, ids, testId);
      const result = response?.data || {};
      const assigned = Number(result.assigned_count || 0);
      const already = Number(result.already_linked_count || 0);
      if (assigned > 0) {
        toast.success(`Added ${assigned} question${assigned === 1 ? '' : 's'} to the test draft.`);
      } else if (already > 0) {
        toast.success('Selected questions are already on that test.');
      } else {
        toast.error('No questions were assigned.');
      }
      setAssignModalOpen(false);
      setAssignTestId('');
      clearSelection();
    } catch (err) {
      toast.error(safeAdminErrorMessage(err, 'Assign to test failed.'));
    } finally {
      setBulkAction('');
    }
  }

  const showBankEmpty = !isLoading && !loadError && pagination.total === 0 && !hasActiveFilters;
  const showFilteredEmpty = !isLoading && !loadError && pagination.total === 0 && hasActiveFilters;

  return (
    <section className="admin-page admin-question-bank">
      <header className="admin-question-bank__header">
        <div>
          <h1 className="heading-2">Question Bank</h1>
          <p className="admin-stat-card__label admin-question-bank__subtitle">
            Search, filter, and manage MCQ questions. Changes apply without reloading the page.
          </p>
        </div>
        <div className="admin-row-actions admin-question-bank__header-actions">
          <Link className="btn btn--secondary admin-touch-target" to={adminRoute('question-bank/import')}>
            <UploadFileOutlinedIcon fontSize="small" aria-hidden />
            Import Aiken
          </Link>
        </div>
      </header>

      <section className="admin-card admin-question-bank__panel">
        <div className="admin-question-bank__toolbar">
          <AdminSearchField
            id="qb-search-text"
            label="Question text"
            placeholder="Search question text…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onClear={() => setSearchText('')}
          />
          <AdminSearchField
            id="qb-search-topic"
            label="Topic"
            placeholder="Search topic…"
            value={searchTopic}
            onChange={(event) => setSearchTopic(event.target.value)}
            onClear={() => setSearchTopic('')}
          />
          <div className="admin-form-field">
            <label className="admin-form-field__label" htmlFor="qb-filter-course">
              Course
            </label>
            <select
              id="qb-filter-course"
              className="admin-form-field__input"
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title || `Course #${course.id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-form-field">
            <label className="admin-form-field__label" htmlFor="qb-filter-subject">
              Subject
            </label>
            <select
              id="qb-filter-subject"
              className="admin-form-field__input"
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              disabled={!courseFilter || isLoadingSubjects}
            >
              <option value="">{courseFilter ? 'All subjects' : 'Select a course first'}</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title || subject.name || `Subject #${subject.id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-form-field">
            <label className="admin-form-field__label" htmlFor="qb-filter-difficulty">
              Difficulty
            </label>
            <select
              id="qb-filter-difficulty"
              className="admin-form-field__input"
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
            >
              <option value="">All difficulties</option>
              {QUESTION_DIFFICULTY_OPTIONS.filter((option) => option.value).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedCount > 0 ? (
          <div className="admin-question-bank__bulk-bar" role="region" aria-label="Bulk actions">
            <p className="admin-question-bank__bulk-summary">
              <strong>{selectedCount}</strong> selected
            </p>
            <div className="admin-row-actions">
              <AdminLoadingButton
                type="button"
                className="btn btn--secondary btn--sm admin-touch-target"
                isLoading={bulkAction === 'assign'}
                disabled={Boolean(bulkAction) && bulkAction !== 'assign'}
                onClick={() => setAssignModalOpen(true)}
              >
                Assign to test
              </AdminLoadingButton>
              <AdminLoadingButton
                type="button"
                className="btn btn--secondary btn--sm admin-touch-target"
                isLoading={bulkAction === 'export'}
                disabled={Boolean(bulkAction) && bulkAction !== 'export'}
                onClick={handleBulkExport}
              >
                Export
              </AdminLoadingButton>
              <AdminLoadingButton
                type="button"
                className="btn btn--danger btn--sm admin-touch-target"
                isLoading={bulkAction === 'delete'}
                disabled={Boolean(bulkAction) && bulkAction !== 'delete'}
                onClick={handleBulkDelete}
              >
                Delete
              </AdminLoadingButton>
              <button type="button" className="btn btn--ghost btn--sm admin-touch-target" onClick={clearSelection}>
                Clear selection
              </button>
            </div>
          </div>
        ) : null}

        <div className="admin-question-bank__meta">
          <p className="admin-stat-card__label" aria-live="polite">
            {isLoading ? 'Loading questions…' : formatRange(pagination.page || currentPage, pagination.limit || PAGE_SIZE, pagination.total || 0)}
          </p>
        </div>

        {loadError ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">Could not load questions</p>
            <p className="admin-empty-state__text">{loadError}</p>
            <button type="button" className="btn btn--secondary admin-touch-target" onClick={() => refreshList()}>
              Try again
            </button>
          </div>
        ) : isLoading ? (
          <div aria-hidden>
            <div className="admin-skeleton admin-skeleton-row" />
            <div className="admin-skeleton admin-skeleton-row" />
            <div className="admin-skeleton admin-skeleton-row" />
            <div className="admin-skeleton admin-skeleton-row" />
          </div>
        ) : showBankEmpty ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">Your question bank is empty</p>
            <p className="admin-empty-state__text">
              Import an Aiken file to add questions in bulk, or create questions from a test quiz builder.
            </p>
            <div className="admin-row-actions" style={{ justifyContent: 'center' }}>
              <Link className="btn btn--primary admin-touch-target" to={adminRoute('question-bank/import')}>
                <AddIcon fontSize="small" aria-hidden />
                Import questions
              </Link>
              <Link className="btn btn--secondary admin-touch-target" to={adminRoute('tests')}>
                Go to tests
              </Link>
            </div>
          </div>
        ) : showFilteredEmpty ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">No questions match your filters</p>
            <p className="admin-empty-state__text">Try different search terms or clear filters to see all questions.</p>
            <button type="button" className="btn btn--secondary admin-touch-target" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap admin-question-bank__table-wrap">
              <table className="admin-table admin-question-bank__table">
                <thead>
                  <tr>
                    <th scope="col" className="admin-question-bank__col-check">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                      />
                    </th>
                    <th scope="col">Question</th>
                    <th scope="col">Topic</th>
                    <th scope="col">Course</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Difficulty</th>
                    <th scope="col">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.question_id} className={selectedIds.has(item.question_id) ? 'admin-question-bank__row--selected' : undefined}>
                      <td data-label="Select">
                        <input
                          type="checkbox"
                          aria-label={`Select question ${item.question_id}`}
                          checked={selectedIds.has(item.question_id)}
                          onChange={() => toggleRow(item.question_id)}
                        />
                      </td>
                      <td data-label="Question" className="admin-question-bank__question-cell">
                        <span className="admin-question-bank__question-id">#{item.question_id}</span>
                        <span className="admin-question-bank__question-preview">{previewQuestionText(item.question_text)}</span>
                      </td>
                      <td data-label="Topic">{item.topic || '—'}</td>
                      <td data-label="Course">
                        {item.course_title || courseTitleById.get(Number(item.course_id)) || `Course #${item.course_id}`}
                      </td>
                      <td data-label="Subject">
                        {item.subject_id
                          ? item.subject_title ||
                            subjectTitleById.get(Number(item.subject_id)) ||
                            `Subject #${item.subject_id}`
                          : '—'}
                      </td>
                      <td data-label="Difficulty">{difficultyLabel(item.difficulty)}</td>
                      <td data-label="Marks">{item.marks ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <nav className="admin-pagination" aria-label="Question bank pagination">
                <p className="admin-pagination__info">
                  {formatRange(pagination.page || currentPage, pagination.limit || PAGE_SIZE, pagination.total || 0)}
                </p>
                <div className="admin-pagination__controls">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm admin-touch-target"
                    disabled={currentPage <= 1 || Boolean(bulkAction)}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </button>
                  <span className="admin-stat-card__label">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm admin-touch-target"
                    disabled={currentPage >= totalPages || Boolean(bulkAction)}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Next
                  </button>
                </div>
              </nav>
            ) : null}
          </>
        )}
      </section>

      {assignModalOpen ? (
        <div className="admin-modal-overlay" role="presentation" onClick={() => !bulkAction && setAssignModalOpen(false)}>
          <div
            className="admin-modal admin-question-bank__assign-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qb-assign-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="qb-assign-title" className="heading-3">
              Assign to test
            </h2>
            <p className="admin-stat-card__label">
              Adds {selectedCount} question{selectedCount === 1 ? '' : 's'} to the test quiz draft. Open the test builder to review before publishing.
            </p>
            <div className="admin-form-field" style={{ marginTop: '1rem' }}>
              <label className="admin-form-field__label" htmlFor="qb-assign-test">
                Draft test
              </label>
              <select
                id="qb-assign-test"
                className="admin-form-field__input"
                value={assignTestId}
                onChange={(event) => setAssignTestId(event.target.value)}
                disabled={Boolean(bulkAction)}
              >
                <option value="">Select a draft test…</option>
                {draftTests.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.title || `Test #${test.id}`}
                    {test.courseId ? ` · ${courseTitleById.get(Number(test.courseId)) || ''}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {!draftTests.length ? (
              <p className="admin-stat-card__label" style={{ marginTop: '0.75rem' }}>
                No draft tests found.{' '}
                <Link to={adminRoute('tests/new')}>Create a test</Link> first.
              </p>
            ) : null}
            <div className="admin-row-actions" style={{ marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn--ghost admin-touch-target"
                disabled={Boolean(bulkAction)}
                onClick={() => {
                  setAssignModalOpen(false);
                  setAssignTestId('');
                }}
              >
                Cancel
              </button>
              <AdminLoadingButton
                type="button"
                className="btn btn--primary admin-touch-target"
                isLoading={bulkAction === 'assign'}
                disabled={!assignTestId || Boolean(bulkAction) && bulkAction !== 'assign'}
                onClick={handleBulkAssign}
              >
                Assign
              </AdminLoadingButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
