import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';

export default function AdminLogsPage() {
  const token = localStorage.getItem('admin_access_token');
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .logs(token)
      .then((response) => setLogs(response?.data || []))
      .catch((err) => setError(err.message || 'Failed to load logs'));
  }, [token]);

  return (
    <section className="admin-card">
      <h2 className="heading-3">Activity Logs</h2>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Entity</th>
              <th>Role</th>
              <th>User</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.length ? (
              logs.map((log) => (
                <tr key={log._id}>
                  <td>{log.action || '-'}</td>
                  <td>{log.entityType || '-'}</td>
                  <td>{log.role || '-'}</td>
                  <td>{log.userId || '-'}</td>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>No logs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
