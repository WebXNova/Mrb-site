import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

export default function AdminRemarksPage() {
  const token = getAdminToken();
  const [remarks, setRemarks] = useState([]);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function loadRemarks() {
    setIsBusy(true);
    setError('');
    try {
      const response = await adminApi.remarks(token);
      setRemarks(response?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load remarks');
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    loadRemarks();
  }, []);

  async function markAsRead(remarkId) {
    try {
      await adminApi.markRemarkRead(token, remarkId);
      await loadRemarks();
    } catch (err) {
      setError(err.message || 'Failed to update remark');
    }
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <h2 className="heading-3">Contact Remarks</h2>
        <p className="body-sm" style={{ marginTop: '0.5rem' }}>
          Messages sent from the website Contact page appear here.
        </p>
        {error ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{error}</p> : null}
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Email</th>
                <th>Remark</th>
                <th>Page</th>
                <th>Received</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {remarks.length ? (
                remarks.map((remark) => (
                  <tr key={remark.id}>
                    <td>{remark.status}</td>
                    <td>{remark.name || '-'}</td>
                    <td>{remark.email || '-'}</td>
                    <td>{remark.message}</td>
                    <td>{remark.pageUrl || '-'}</td>
                    <td>{new Date(remark.createdAt).toLocaleString()}</td>
                    <td>
                      {remark.status === 'new' ? (
                        <button
                          className="btn btn--secondary btn--sm"
                          type="button"
                          onClick={() => markAsRead(remark.id)}
                        >
                          Mark Read
                        </button>
                      ) : (
                        'Read'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>{isBusy ? 'Loading remarks...' : 'No remarks yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
