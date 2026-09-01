import { useEffect, useMemo, useState } from 'react';
import { studentApi } from '../api/studentApi';
import StudentIcon from '../student/components/icons/StudentIcons';
import {
  formatLeaderboardRank,
  formatScorePercent,
  looksMaskedName,
  normalizeStudentLeaderboard,
} from '../features/leaderboard/normalizeLeaderboard';
import '../student/styles/student-leaderboard.css';

function YouBadge() {
  return <span className="student-leaderboard-you">You</span>;
}

function RankMark({ rank }) {
  if (rank === 1) {
    return <StudentIcon name="trophy" size={14} className="student-leaderboard-rank-icon student-leaderboard-rank-icon--1" />;
  }
  if (rank === 2 || rank === 3) {
    return <StudentIcon name="award" size={14} className={`student-leaderboard-rank-icon student-leaderboard-rank-icon--${rank}`} />;
  }
  return null;
}

function ScoreMeter({ value }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="student-leaderboard-bar" aria-hidden>
      <div className="student-leaderboard-bar__fill" style={{ '--score-width': `${width}%` }} />
    </div>
  );
}

export default function StudentLeaderboardPage() {
  const [courseTitle, setCourseTitle] = useState('');
  const [entries, setEntries] = useState([]);
  const [bands, setBands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadBoard() {
      setLoading(true);
      setError('');
      try {
        const response = await studentApi.currentLeaderboard();
        const normalized = normalizeStudentLeaderboard(response);
        if (!mounted) return;
        setCourseTitle(normalized.courseTitle);
        setEntries(normalized.entries);
        setBands(normalized.bands);
      } catch (err) {
        if (!mounted) return;
        setCourseTitle('');
        setEntries([]);
        setBands([]);
        setError(err?.message || 'Unable to load the leaderboard.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadBoard();
    return () => {
      mounted = false;
    };
  }, []);

  const you = useMemo(() => entries.find((row) => row.isCurrentStudent) || null, [entries]);
  const visibleBands = useMemo(() => {
    let offset = 0;
    return bands
      .filter((band) => band.entries.length > 0)
      .map((band) => {
        const startIndex = offset;
        offset += band.entries.length;
        return { ...band, startIndex };
      });
  }, [bands]);

  return (
    <section className="student-leaderboard-page">
      <header className="student-leaderboard-hero">
        <p className="student-leaderboard-kicker">Current course</p>
        <h2 className="heading-3 student-leaderboard-course">{courseTitle || 'Leaderboard'}</h2>
        <p className="student-leaderboard-page__lead">
          Rankings use your average on graded tests in this course. Names stay private — only you can spot your own row.
        </p>
      </header>

      {!loading && !error && entries.length > 0 ? (
        <div className="student-leaderboard-summary" aria-label="Your standing">
          <div className="student-leaderboard-summary__item">
            <span className="student-leaderboard-summary__label">Your rank</span>
            <span className="student-leaderboard-summary__value">
              {you ? formatLeaderboardRank(you.rank) : '—'}
            </span>
          </div>
          <div className="student-leaderboard-summary__item">
            <span className="student-leaderboard-summary__label">Your score</span>
            <span className="student-leaderboard-summary__value">
              {you ? formatScorePercent(you.averageScore) : '—'}
            </span>
          </div>
          <div className="student-leaderboard-summary__item">
            <span className="student-leaderboard-summary__label">Students</span>
            <span className="student-leaderboard-summary__value">{entries.length}</span>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="student-notes__loading" role="status">
          <span className="student-notes__spinner student-notes__spinner--inline" aria-hidden />
          Loading rankings…
        </div>
      ) : null}

      {error ? <p className="admin-error">{error}</p> : null}

      {!loading && !error && entries.length === 0 ? (
        <div className="student-leaderboard-empty">
          <StudentIcon name="trophy" size={40} className="student-leaderboard-empty__icon" />
          <p className="student-leaderboard-empty__title">The board is waiting for the first scores</p>
          <p className="student-leaderboard-empty__hint">
            Complete a graded test in this course and your name will appear here.
          </p>
        </div>
      ) : null}

      {!loading && !error && entries.length > 0 ? (
        <div className="student-leaderboard-board">
          <table className="student-leaderboard-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Student</th>
                <th scope="col">Score</th>
                <th scope="col">Performance</th>
                <th scope="col">Tests graded</th>
              </tr>
            </thead>
            {visibleBands.map((band) => (
              <tbody key={band.id}>
                <tr className="student-leaderboard-section">
                  <th scope="colgroup" colSpan={5}>
                    <span className="student-leaderboard-section__range">{band.rangeLabel}</span>
                    <span className="student-leaderboard-section__dot" aria-hidden>
                      •
                    </span>
                    <span className="student-leaderboard-section__title">{band.title}</span>
                  </th>
                </tr>
                {band.entries.map((entry, index) => (
                  <tr
                    key={`${entry.rank}-${entry.displayName}`}
                    className={`student-leaderboard-row${entry.isCurrentStudent ? ' student-leaderboard-row--you' : ''}${
                      entry.rank <= 3 ? ` student-leaderboard-row--top student-leaderboard-row--top-${entry.rank}` : ''
                    }`}
                    style={{ '--row-index': band.startIndex + index }}
                  >
                    <td className="student-leaderboard-td student-leaderboard-td--rank">
                      <span className="student-leaderboard-rank">
                        <RankMark rank={entry.rank} />
                        <span>{formatLeaderboardRank(entry.rank)}</span>
                      </span>
                    </td>
                    <td className="student-leaderboard-td student-leaderboard-td--name">
                      <span className="student-leaderboard-name">
                        <span data-masked={looksMaskedName(entry.displayName) ? 'true' : 'false'}>
                          {entry.displayName}
                        </span>
                        {entry.isCurrentStudent ? <YouBadge /> : null}
                      </span>
                    </td>
                    <td className="student-leaderboard-td student-leaderboard-td--score">
                      <span className="student-leaderboard-score">{formatScorePercent(entry.averageScore)}</span>
                      <ScoreMeter value={entry.averageScore} />
                    </td>
                    <td className="student-leaderboard-td student-leaderboard-td--perf">
                      {entry.performanceLabel}
                    </td>
                    <td className="student-leaderboard-td student-leaderboard-td--tests">
                      {entry.testsTaken}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : null}
    </section>
  );
}
