import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { useDebouncedValue } from '../components/admin/useDebouncedValue';
import StudentTestFilters from '../student/components/tests/StudentTestFilters';
import StudentTestSections from '../student/components/tests/StudentTestSections';
import {
  collectTestSubjectOptions,
  filterStudentTests,
  groupTestsByAttemptStatus,
} from '../student/utils/filterStudentTests';
import '../student/styles/student-tests.css';

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
    max_attempts: row.max_attempts,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    attempts_used: row.attempts_used,
    attempts_remaining: row.attempts_remaining,
  };
}

export default function StudentTestsPage() {
  const [tests, setTests] = useState([]);
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
        const response = await studentApi.listTests({ page: 1, limit: 50 });
        const items = Array.isArray(response?.data?.items) ? response.data.items : [];
        if (mounted) {
          setTests(items.map(normaliseApiTest).filter(Boolean));
        }
      } catch (err) {
        if (mounted) {
          setError(err?.message || 'Unable to load tests.');
          setTests([]);
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

  function clearFilters() {
    setSearch('');
    setSubjectId('all');
    setDateFilter('all');
    setAttemptFilter('all');
  }

  return (
    <section className="student-tests-page sp-panel sp-card">
      <div className="student-page-header student-tests-page__header">
        <div>
          <h2 className="heading-3 student-tests-page__title">Practice tests</h2>
          <p className="student-tests-page__lead">
            Filter by subject or date, search by name, and see what is new versus already completed.
          </p>
        </div>
        <div className="student-page-header__actions">
          <Link className="btn btn--secondary btn--sm" to="/dashboard/tests/history">
            View results
          </Link>
        </div>
      </div>

      <StudentTestFilters
        search={search}
        subjectId={subjectId}
        dateFilter={dateFilter}
        attemptFilter={attemptFilter}
        subjects={subjectOptions}
        resultCount={filteredTests.length}
        totalCount={tests.length}
        onSearchChange={setSearch}
        onSubjectChange={setSubjectId}
        onDateFilterChange={setDateFilter}
        onAttemptFilterChange={setAttemptFilter}
        onClear={clearFilters}
      />

      {loading ? <p className="student-tests-page__status">Loading tests…</p> : null}
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
        />
      ) : null}
    </section>
  );
}
