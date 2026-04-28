import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';

function StatCard({ label, value }) {
  return (
    <article className="admin-stat-card">
      <p className="admin-stat-card__label">{label}</p>
      <p className="admin-stat-card__value">{value}</p>
    </article>
  );
}

export default function AdminDashboardPage() {
  const token = localStorage.getItem('admin_access_token');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({});
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await adminApi.dashboard(token);
        if (!mounted) return;
        setStats(response?.data?.stats || {});
        setLogs(response?.data?.recentLogs || []);
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
        <StatCard label="Teachers" value={stats.totalTeachers || 0} />
        <StatCard label="Admins" value={stats.totalAdmins || 0} />
        <StatCard label="Courses" value={stats.totalCourses || 0} />
        <StatCard label="Lectures" value={stats.totalLectures || 0} />
        <StatCard label="Tests" value={stats.totalTests || 0} />
        <StatCard label="Available MRB Codes" value={stats.availableCodes || 0} />
      </div>

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
