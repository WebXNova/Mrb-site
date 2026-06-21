import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import InsightsChart, { SubjectWorkloadChart } from '../components/teacher-insights/InsightsChart';
import TeacherHealthGauge from '../components/teacher-insights/TeacherHealthGauge';
import InsightsAlerts, {
  InsightsActivityFeed,
  InsightsLeaderboardPanel,
} from '../components/teacher-insights/InsightsPanels';
import TeacherProfileCard from '../components/qa-monitoring/TeacherProfileCard';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { formatDuration } from '../components/qa-monitoring/qaMonitoringUtils';
import '../styles/admin-teacher-insights.css';
import '../styles/admin-qa-monitoring.css';

const POLL_MS = 25000;

function formatDurationShort(seconds) {
  if (seconds == null) return '—';
  return formatDuration(seconds);
}

export default function AdminTeacherInsightsPage() {
  const token = getAdminToken();
  const [searchParams, setSearchParams] = useSearchParams();
  const teacherIdParam = searchParams.get('teacherId') || '';

  const [teachers, setTeachers] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const selectedTeacherId = teacherIdParam ? String(teacherIdParam) : '';
  const isTeacherMode = dashboard?.mode === 'teacher';

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      if (!document.documentElement.dataset.tiThemeOverride) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    adminApi
      .teachers(token)
      .then((res) => setTeachers(Array.isArray(res?.data ?? res) ? (res?.data ?? res) : []))
      .catch(() => setTeachers([]));
  }, [token]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.teacherInsightsDashboard(token, {
        teacherId: selectedTeacherId || undefined,
      });
      setDashboard(response?.data ?? response ?? null);
      setLastRefresh(Date.now());
    } catch {
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [token, selectedTeacherId]);

  const refreshFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const response = await adminApi.teacherInsightsActivityFeed(token, {
        teacherId: selectedTeacherId || undefined,
        page: 1,
        limit: 20,
      });
      const data = response?.data ?? response ?? {};
      setDashboard((prev) =>
        prev ? { ...prev, activityFeed: data.items ?? prev.activityFeed } : prev
      );
    } catch {
      // keep existing feed
    } finally {
      setFeedLoading(false);
    }
  }, [token, selectedTeacherId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadDashboard();
      refreshFeed();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [loadDashboard, refreshFeed]);

  function selectTeacher(id) {
    if (id) {
      setSearchParams({ teacherId: String(id) });
    } else {
      setSearchParams({});
    }
  }

  const charts = useMemo(() => dashboard?.charts ?? {}, [dashboard]);
  const health = dashboard?.health ?? null;
  const alerts = dashboard?.alerts ?? [];
  const feed = dashboard?.activityFeed ?? [];
  const leaderboard = dashboard?.leaderboard ?? null;
  const teacher = dashboard?.teacher ?? null;
  const metrics = dashboard?.metrics ?? null;

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.tiThemeOverride = '1';
  }

  return (
    <motion.div
      className="ti-page admin-page"
      data-theme={theme}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <header className="ti-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h1>Teacher Insights</h1>
            <span className="ti-badge">Intelligence · Read-only</span>
          </div>
          <p>
            Understand teacher performance instantly — health scores, activity patterns, and alerts.
            Monitor only; never interfere with teacher–student communication.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <select
            className="ti-select"
            value={selectedTeacherId}
            onChange={(e) => selectTeacher(e.target.value)}
            aria-label="Select teacher for insights"
          >
            <option value="">All teachers — overview</option>
            {teachers.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.fullName || `Teacher #${t.id}`}
              </option>
            ))}
          </select>
          <button type="button" className="ti-select" onClick={toggleTheme} style={{ cursor: 'pointer' }}>
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
          <span className="ti-live">
            <span className="ti-live__dot" />
            Updated {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        </div>
      </header>

      {isTeacherMode && teacher ? (
        <TeacherProfileCard
          teacher={teacher}
          lastActivity={metrics?.lastActivityAt}
          loading={loading && !teacher}
        />
      ) : null}

      <div className="ti-grid-main">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isTeacherMode ? (
            <TeacherHealthGauge health={health} loading={loading} />
          ) : (
            <InsightsLeaderboardPanel
              leaderboard={leaderboard}
              onSelectTeacher={selectTeacher}
              loading={loading}
            />
          )}
          <InsightsAlerts alerts={alerts} loading={loading} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isTeacherMode && metrics ? (
            <div className="ti-grid-3">
              <div className="ti-card">
                <div className="ti-section-title">Avg response</div>
                <strong style={{ fontSize: '1.35rem' }}>
                  {formatDurationShort(metrics.avgResponseSeconds)}
                </strong>
              </div>
              <div className="ti-card">
                <div className="ti-section-title">Answered</div>
                <strong style={{ fontSize: '1.35rem' }}>
                  {metrics.answered}/{metrics.totalAssigned}
                </strong>
              </div>
              <div className="ti-card">
                <div className="ti-section-title">Pending</div>
                <strong style={{ fontSize: '1.35rem' }}>{metrics.pendingCount}</strong>
              </div>
            </div>
          ) : null}

          {isTeacherMode ? (
            <div className="ti-grid-2">
              <div className="ti-card">
                <InsightsChart
                  title="Questions answered / day"
                  subtitle="Last 30 days"
                  data={charts.answeredPerDay ?? []}
                  color="#6366f1"
                />
              </div>
              <div className="ti-card">
                <InsightsChart
                  title="Response time trend"
                  subtitle="Avg seconds per day"
                  data={charts.responseTimeTrend ?? []}
                  color="#059669"
                  formatValue={(v) => formatDurationShort(v)}
                />
              </div>
              <div className="ti-card">
                <InsightsChart
                  title="Activity trend"
                  subtitle="Events per day"
                  data={charts.activityTrend ?? []}
                  color="#8b5cf6"
                />
              </div>
              <div className="ti-card">
                <InsightsChart
                  title="Monthly performance"
                  subtitle="Answered per month"
                  data={(charts.monthlyPerformance ?? []).map((m) => ({
                    month: m.month,
                    value: m.answered,
                  }))}
                  color="#2563eb"
                />
              </div>
            </div>
          ) : null}

          {isTeacherMode ? (
            <div className="ti-card">
              <SubjectWorkloadChart data={charts.subjectWorkload ?? []} />
            </div>
          ) : (
            <div className="ti-card">
              <h3 className="ti-section-title">Pending workload leaderboard</h3>
              {loading ? (
                <div className="ti-skeleton" style={{ height: 120 }} />
              ) : (
                <table className="ti-pending-board">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Pending</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(leaderboard?.pendingLeaderboard ?? []).map((row) => (
                      <tr
                        key={row.teacherId}
                        onClick={() => selectTeacher(row.teacherId)}
                        onKeyDown={(e) => e.key === 'Enter' && selectTeacher(row.teacherId)}
                        tabIndex={0}
                        role="button"
                      >
                        <td>{row.teacherName}</td>
                        <td>{row.pending}</td>
                        <td>{row.totalAssigned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <InsightsActivityFeed items={feed} loading={loading || feedLoading} />
        </div>
      </div>
    </motion.div>
  );
}
