import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';

export default function AdminMrbCodesPage() {
  const token = localStorage.getItem('admin_access_token');
  const [codes, setCodes] = useState([]);
  const [count, setCount] = useState(10);
  const [batchLabel, setBatchLabel] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadCodes() {
    const response = await adminApi.mrbCodes(token);
    setCodes(response?.data || []);
  }

  useEffect(() => {
    loadCodes().catch((err) => setError(err.message || 'Failed to load MRB codes'));
  }, []);

  async function generate(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await adminApi.generateMrbCodes(token, { count: Number(count), batchLabel: batchLabel || null });
      setSuccess('Codes generated successfully');
      await loadCodes();
    } catch (err) {
      setError(err.message || 'Failed to generate codes');
    }
  }

  async function remove(codeId) {
    if (!window.confirm('Delete this unused code?')) return;
    setError('');
    try {
      await adminApi.deleteMrbCode(token, codeId);
      await loadCodes();
    } catch (err) {
      setError(err.message || 'Failed to delete code');
    }
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <h2 className="heading-3">Generate MRB Codes</h2>
        <form className="admin-actions" style={{ marginTop: '1rem' }} onSubmit={generate}>
          <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} required />
          <input
            type="text"
            placeholder="Batch label (optional)"
            value={batchLabel}
            onChange={(e) => setBatchLabel(e.target.value)}
          />
          <button className="btn btn--primary" type="submit">
            Generate
          </button>
        </form>
        {error ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{error}</p> : null}
        {success ? <p className="admin-success" style={{ marginTop: '0.75rem' }}>{success}</p> : null}
      </section>

      <section className="admin-card">
        <h2 className="heading-3">MRB Codes</h2>
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Batch</th>
                <th>Status</th>
                <th>Used By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {codes.length ? (
                codes.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.batchLabel || '-'}</td>
                    <td>{row.isUsed ? 'Used' : 'Unused'}</td>
                    <td>{row.usedBy || '-'}</td>
                    <td>
                      {!row.isUsed ? (
                        <button className="btn btn--secondary btn--sm" onClick={() => remove(row.id)} type="button">
                          Delete
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No codes generated yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
