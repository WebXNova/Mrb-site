import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { useDebouncedValue } from '../components/admin/useDebouncedValue';
import StudentTestFilters from '../student/components/tests/StudentTestFilters';
import StudentTestSectionHeader from '../student/components/tests/StudentTestSectionHeader';
import StudentTestSections from '../student/components/tests/StudentTestSections';
import {
  collectTestSubjectOptions,
  filterStudentTests,
  groupTestsByAttemptStatus,
} from '../student/utils/filterStudentTests';
import '../student/styles/student-tests.css';

const LIST_PAGE_SIZE = 50;

function normaliseApiTest(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    subject_label: row.subject_label,
    subject_ids: row.subject_ids,
    public_slug: row.public_slug,
    slug: row.public_slug,
    duration_minutes: row.duration_minutes,
    question_count: row.question_count,
    max_attempts: row.max_attempts,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    attempts_used: row.attempts_used,
    attempts_remaining: row.attempts_remaining,
  };
}

function extractTestListPayload(response) {
  const payload = response?.data && typeof response.data === 'object' ? response.data : response;
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.tests)
      ? payload.tests
      : [];
  const pagination = payload?.pagination && typeof payload.pagination === 'object' ? payload.pagination : {};
  const total = Number(pagination.total);
  return {
    items,
    total: Number.isFinite(total) && total >= 0 ? total : items.length,
    limit: Number(pagination.limit) > 0 ? Number(pagination.limit) : LIST_PAGE_SIZE,
  };
}

async function fetchAllStudentTests() {
  const first = await studentApi.listTests({ page: 1, limit: LIST_PAGE_SIZE });
  const parsed = extractTestListPayload(first);
  const items = [...parsed.items];
  const pageSize = parsed.limit;
  const totalPages = pageSize > 0 ? Math.ceil(parsed.total / pageSize) : 1;

  for (let page = 2; page <= totalPages; page += 1) {
    const next = await studentApi.listTests({ page, limit: pageSize });
    items.push(...extractTestListPayload(next).items);
  }

  return {
    items: items.map(normaliseApiTest).filter(Boolean),
    total: Math.max(parsed.total, items.length),
  };
}

export default function StudentTestsPage() {
  const [tests, setTests] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [attemptFilter, setAttemptFilter] = useState('all');
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const { items, total } = await fetchAllStudentTests();
        if (mounted) {
          setTests(items);
          setCatalogTotal(total);
        }
      } catch (err) {
        if (mounted) {
          setError(err?.message || 'Unable to load tests.');
          setTests([]);
          setCatalogTotal(0);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const subjectOptions = useMemo(() => collectTestSubjectOptions(tests), [tests]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    subjectId !== 'all' ||
    dateFilter !== 'all' ||
    attemptFilter !== 'all';

  const filteredTests = useMemo(
    () =>
      filterStudentTests(tests, {
        search: debouncedSearch,
        subjectId,
        dateFilter,
        attemptFilter,
      }),
    [tests, debouncedSearch, subjectId, dateFilter, attemptFilter]
  );

  const { available, completed } = useMemo(
    () => groupTestsByAttemptStatus(filteredTests),
    [filteredTests]
  );

  const showGrouped = attemptFilter === 'all';
  const totalCount = Math.max(catalogTotal, tests.length);

  function clearFilters() {
    setSearch('');
    setSubjectId('all');
    setDateFilter('all');
    setAttemptFilter('all');
  }

  return (
    <section className="student-tests-page">
      <StudentTestSectionHeader
        id="tests-practice-heading"
        variant="page"
        title="Practice tests"
        count={loading ? null : totalCount}
        subtitle="Filter by subject or date, search by name, and see what is new versus already completed."
        action={
          <Link className="student-tests-page__results-btn" to="/dashboard/tests/history">
            View results
          </Link>
        }
      />

      <StudentTestFilters
        search={search}
        subjectId={subjectId}
        dateFilter={dateFilter}
        attemptFilter={attemptFilter}
        subjects={subjectOptions}
        resultCount={filteredTests.length}
        totalCount={totalCount}
        loading={loading}
        onSearchChange={setSearch}
        onSubjectChange={setSubjectId}
        onDateFilterChange={setDateFilter}
        onAttemptFilterChange={setAttemptFilter}
        onClear={clearFilters}
      />

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <StudentTestSections
          available={available}
          completed={completed}
          showGrouped={showGrouped}
          hasActiveFilters={hasActiveFilters}
          totalCount={totalCount}
          onClearFilters={clearFilters}
        />
      ) : null}
    </section>
  );
}
