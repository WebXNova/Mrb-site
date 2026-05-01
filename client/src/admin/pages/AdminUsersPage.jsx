import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export default function AdminUsersPage() {
  const token = localStorage.getItem('admin_access_token');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  async function loadUsers() {
    const response = await adminApi.users(token);
    setUsers(response?.data || []);
  }

  useEffect(() => {
    loadUsers().catch((err) => setError(err.message || 'Failed to load users'));
  }, [token]);

  async function setStatus(userId, status) {
    setError('');
    try {
      await adminApi.updateUserStatus(token, userId, status);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    }
  }

  return (
    <section className="admin-card">
      <h2 className="heading-3">Users</h2>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Registered</th>
              <th>Last Login</th>
              <th>Last Login IP</th>
              <th>Login Count</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length ? (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName}</td>
                  <td>{user.username || '-'}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                  <td title={user.registeredUserAgent || ''}>{formatDateTime(user.registeredAt || user.createdAt)}</td>
                  <td title={user.lastLoginUserAgent || ''}>{formatDateTime(user.lastLoginAt)}</td>
                  <td>{user.lastLoginIpAddress || '-'}</td>
                  <td>{user.loginCount ?? 0}</td>
                  <td>
                    {user.role === 'admin' || user.role === 'super_admin' ? (
                      '-'
                    ) : (
                      <div className="admin-row-actions">
                        <button
                          className="btn btn--secondary btn--sm"
                          type="button"
                          onClick={() =>
                            setStatus(user.id, user.status === 'active' ? 'suspended' : 'active')
                          }
                        >
                          {user.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10}>No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
