import { useCallback, useEffect, useMemo, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminSearchField from '../components/AdminSearchField';
import AdminSectionErrorBoundary from '../components/AdminSectionErrorBoundary';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import {
  formatScorePercent,
  normalizeAdminLeaderboard,
  normalizeLeaderboardDetail,
} from '../../features/leaderboard/normalizeLeaderboard';
import '../styles/admin-leaderboard.css';

const SORT_KEYS = {
  rank: (row) => row.rank,
  name: (row) => String(row.displayName || '').toLowerCase(),
  average: (row) => Number(row.averageScore) || 0,
  tests: (row) => Number(row.testsTaken) || 0,
  high: (row) => Number(row.highestScore) || 0,
  low: (row) => Number(row.lowestScore) || 0,
};

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function sortRows(rows, sortKey, direction) {
  const getter = SORT_KEYS[sortKey] || SORT_KEYS.rank;
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (typeof av === 'string' || typeof bv === 'string') {
      const cmp = String(av).localeCompare(String(bv));
      return direction === 'asc' ? cmp : -cmp;
    }
    return direction === 'asc' ? av - bv : bv - av;
  });
  return copy;
}

function PassPill({ passed }) {
  if (passed == null) return <span>—</span>;
  return (
    <span className={`admin-status-pill ${passed ? 'admin-status-pill--approved' : 'admin-status-pill--rejected'}`}>
      {passed ? 'Pass' : 'Fail'}
    </span>
  );
}

function LeaderboardDrawer({ courseId, student, onClose }) {
  const token = getAdminToken();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!student?.studentId || !courseId) return undefined;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await adminApi.studentCourseDetail(token, student.studentId, courseId);
        if (mounted) setDetail(normalizeLeaderboardDetail(response));
      } catch (err) {
        if (mounted) setError(err?.message || 'Unable to load student details.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [token, student?.studentId, courseId]);

  const enrollment = detail?.enrollment || {};
  const facts = [
    ['Full name', enrollment.fullName || student.displayName],
    ['Father’s name', enrollment.fatherName],
    ['WhatsApp', enrollment.whatsapp],
    ['Email', enrollment.email],
    ['City', enrollment.city],
    ['District', enrollment.district],
    ['Province', enrollment.province],
    ['Class / HSSC', enrollment.hsscStatus],
    ['Gender', enrollment.gender],
    ['Date of birth', enrollment.dateOfBirth],
    ['MDCAT attempt', enrollment.mdcatAttemptType],
    ['Board', enrollment.board],
  ].filter(([, value]) => value);

  return (
    <div className="lb-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="lb-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="lb-drawer__head">
          <div>
            <p className="lb-drawer__kicker">Rank {student.rank}</p>
            <h3 id="lb-drawer-title" className="lb-drawer__title">
              {student.displayName}
            </h3>
          </div>
          <button type="button" className="mp-icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </button>
        </header>

        {loading ? (
          <div className="mp-loading">
            <span className="admin-spinner" aria-hidden />
            Loading student details…
          </div>
        ) : null}
        {error ? <p className="admin-error">{error}</p> : null}

        {!loading && !error && detail ? (
          <div className="lb-drawer__body">
            <section className="lb-drawer__section">
              <h4>Enrollment details</h4>
              {facts.length === 0 ? (
                <p className="admin-muted">No enrollment profile fields were returned for this course.</p>
              ) : (
                <dl className="lb-facts">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section className="lb-drawer__section">
              <h4>Test history</h4>
              {detail.attempts.length === 0 ? (
                <p className="admin-muted">No graded attempts in this course yet.</p>
              ) : (
                <div className="admin-table-wrap lb-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Test</th>
                        <th>Date taken</th>
                        <th>Score</th>
                        <th>%</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.attempts.map((attempt) => (
                        <tr key={String(attempt.id ?? `${attempt.testName}-${attempt.takenAt}`)}>
                          <td>{attempt.testName}</td>
                          <td>{formatWhen(attempt.takenAt)}</td>
                          <td>{attempt.score || '—'}</td>
                          <td>{formatScorePercent(attempt.percentage)}</td>
                          <td>
                            <PassPill passed={attempt.passed} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function AdminLeaderboardPageContent() {
  const token = getAdminToken();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [courseQuery, setCourseQuery] = useState('');
  const [entries, setEntries] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [sortKey, setSortKey] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function loadCourses() {
      setLoadingCourses(true);
      try {
        const response = await adminApi.courses(token);
        const rows = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.data?.courses)
            ? response.data.courses
            : Array.isArray(response?.data?.items)
              ? response.data.items
              : [];
        if (!mounted) return;
        setCourses(rows);
        if (rows[0]?.id) setCourseId(String(rows[0].id));
      } catch (err) {
        if (mounted) setError(err?.message || 'Unable to load courses.');
      } finally {
        if (mounted) setLoadingCourses(false);
      }
    }
    loadCourses();
    return () => {
      mounted = false;
    };
  }, [token]);

  const loadBoard = useCallback(async () => {
    if (!courseId) {
      setEntries([]);
      return;
    }
    setLoadingBoard(true);
    setError('');
    try {
      const response = await adminApi.courseLeaderboard(token, courseId);
      setEntries(normalizeAdminLeaderboard(response).entries);
    } catch (err) {
      setEntries([]);
      setError(err?.message || 'Unable to load the leaderboard.');
    } finally {
      setLoadingBoard(false);
    }
  }, [token, courseId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'rank' || key === 'name' ? 'asc' : 'desc');
  }

  const visibleCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    const rows = Array.isArray(courses) ? courses : [];
    if (!q) return rows;
    return rows.filter((course) => {
      const label = String(course.title || course.name || '').toLowerCase();
      return label.includes(q) || String(course.id) === q || String(course.id) === courseId;
    });
  }, [courses, courseQuery, courseId]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const rows = q
      ? entries.filter((row) => String(row.displayName || '').toLowerCase().includes(q))
      : entries;
    return sortRows(rows, sortKey, sortDir);
  }, [entries, debouncedSearch, sortKey, sortDir]);

  const podium = [2, 1, 3]
    .map((rank) => entries.find((row) => row.rank === rank))
    .filter(Boolean);

  return (
    <section className="admin-page admin-page--leaderboard">
      <header className="mp-hero">
        <div>
          <h2 className="heading-3 mp-title">Leaderboard</h2>
          <p className="mp-subtitle">
            Course rankings from graded test results. Open a student for enrollment details and full attempt history.
          </p>
        </div>
      </header>

      <div className="lb-toolbar">
        <div className="lb-field">
          <label htmlFor="lb-course-filter">Find course</label>
          <input
            id="lb-course-filter"
            type="search"
            value={courseQuery}
            onChange={(event) => setCourseQuery(event.target.value)}
            placeholder="Filter course list…"
          />
        </div>
        <div className="lb-field">
          <label htmlFor="lb-course">Course</label>
          <select
            id="lb-course"
            value={courseId}
            disabled={loadingCourses}
            onChange={(event) => setCourseId(event.target.value)}
          >
            {visibleCourses.length === 0 ? <option value="">No courses</option> : null}
            {visibleCourses.map((course) => (
              <option key={course.id} value={String(course.id)}>
                {course.title || course.name || `Course ${course.id}`}
              </option>
            ))}
          </select>
        </div>
        <AdminSearchField
          id="lb-search"
          label="Search students"
          placeholder="Search by student name…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
        />
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      {loadingBoard ? (
        <div className="mp-loading">
          <span className="admin-spinner" aria-hidden />
          Loading rankings…
        </div>
      ) : null}

      {!loadingBoard && !error && podium.length > 0 ? (
        <div className="lb-podium">
          {podium.map((entry) => (
            <article key={entry.studentId || entry.rank} className={`lb-podium__card lb-podium__card--${entry.rank}`}>
              <p className="lb-podium__kicker">Rank {entry.rank}</p>
              <h3 className="lb-podium__name">{entry.displayName}</h3>
              <div className="lb-podium__stats">
                <span>{formatScorePercent(entry.averageScore)} avg</span>
                <span>{entry.testsTaken} tests</span>
                <span>High {formatScorePercent(entry.highestScore)}</span>
                <span>Low {formatScorePercent(entry.lowestScore)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loadingBoard && !error && filtered.length === 0 ? (
        <div className="lb-empty">
          <EmojiEventsOutlinedIcon aria-hidden />
          <p>No graded results yet for this course.</p>
        </div>
      ) : null}

      {!loadingBoard && filtered.length > 0 ? (
        <div className="admin-table-wrap lb-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th aria-sort={sortKey === 'rank' ? sortDir : 'none'} onClick={() => toggleSort('rank')}>
                  Rank
                </th>
                <th aria-sort={sortKey === 'name' ? sortDir : 'none'} onClick={() => toggleSort('name')}>
                  Student
                </th>
                <th aria-sort={sortKey === 'average' ? sortDir : 'none'} onClick={() => toggleSort('average')}>
                  Average
                </th>
                <th aria-sort={sortKey === 'tests' ? sortDir : 'none'} onClick={() => toggleSort('tests')}>
                  Tests
                </th>
                <th aria-sort={sortKey === 'high' ? sortDir : 'none'} onClick={() => toggleSort('high')}>
                  Highest
                </th>
                <th aria-sort={sortKey === 'low' ? sortDir : 'none'} onClick={() => toggleSort('low')}>
                  Lowest
                </th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.studentId || `${row.rank}-${row.displayName}`}>
                  <td>{row.rank}</td>
                  <td>
                    <button type="button" className="lb-link" onClick={() => setSelected(row)}>
                      {row.displayName}
                    </button>
                  </td>
                  <td>{formatScorePercent(row.averageScore)}</td>
                  <td>{row.testsTaken}</td>
                  <td>{formatScorePercent(row.highestScore)}</td>
                  <td>{formatScorePercent(row.lowestScore)}</td>
                  <td>
                    <button type="button" className="lb-link" onClick={() => setSelected(row)}>
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <LeaderboardDrawer courseId={courseId} student={selected} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  );
}

export default function AdminLeaderboardPage() {
  return (
    <AdminSectionErrorBoundary title="Leaderboard could not load">
      <AdminLeaderboardPageContent />
    </AdminSectionErrorBoundary>
  );
}
