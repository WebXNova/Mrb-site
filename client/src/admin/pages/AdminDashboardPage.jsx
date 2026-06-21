import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

function StatCard({ label, value, hint }) {
  return (
    <article className="admin-stat-card">
      <p className="admin-stat-card__label">{label}</p>
      <p className="admin-stat-card__value">{value}</p>
      {hint ? (
        <p className="admin-stat-card__label" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
          {hint}
        </p>
      ) : null}
    </article>
  );
}

function formatActivityDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function AdminDashboardPage() {
  const token = getAdminToken();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({});
  const [transferStats, setTransferStats] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [dashboardRes, transferRes] = await Promise.all([
          adminApi.dashboard(token),
          adminApi.getTestTransferDashboard(token).catch(() => null),
        ]);
        if (!mounted) return;
        setStats(dashboardRes?.data?.stats || {});
        setLogs(dashboardRes?.data?.recentLogs || []);
        setTransferStats(transferRes?.data?.stats ?? transferRes?.stats ?? null);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load dashboard');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [token]);

  if (loading) return <section className="admin-card">Loading dashboard...</section>;

  return (
    <section className="admin-page">
      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-grid">
        <StatCard label="Total Users" value={stats.totalUsers || 0} />
        <StatCard label="Students" value={stats.totalStudents || 0} />
        <StatCard label="Pending Questions" value={stats.pendingQuestions || 0} />
        <StatCard label="Admins" value={stats.totalAdmins || 0} />
        <StatCard label="Courses" value={stats.totalCourses || 0} />
        <StatCard label="Lectures" value={stats.totalLectures || 0} />
        <StatCard label="Tests" value={stats.totalTests || 0} />
      </div>

      {transferStats ? (
        <section className="admin-card" style={{ marginTop: 'var(--space-4)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
            }}
          >
            <h2 className="heading-3">Test export / import</h2>
            <Link className="btn btn--secondary admin-touch-target" to={adminRoute('tests/transfer')}>
              View history
            </Link>
          </div>
          <div className="admin-grid" style={{ marginTop: '1rem' }}>
            <StatCard label="Exports" value={transferStats.export_count ?? 0} />
            <StatCard label="Imports" value={transferStats.import_count ?? 0} />
            <StatCard
              label="Failures"
              value={transferStats.failure_count ?? 0}
              hint={`${transferStats.export_failures ?? 0} export · ${transferStats.import_failures ?? 0} import`}
            />
            <StatCard
              label="Last activity"
              value={formatActivityDate(transferStats.last_activity_at)}
            />
          </div>
        </section>
      ) : null}

      <section className="admin-card">
        <h2 className="heading-3">Recent Activity</h2>
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Entity</th>
                <th>Role</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.length ? (
                logs.map((log) => (
                  <tr key={log._id}>
                    <td>{log.action || '-'}</td>
                    <td>{log.entityType || '-'}</td>
                    <td>{log.role || '-'}</td>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No recent activity found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
