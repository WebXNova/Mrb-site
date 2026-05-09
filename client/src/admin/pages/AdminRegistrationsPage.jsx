import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { receiptMediaUrl } from '../../utils/mediaUrl';
import { downloadEnrollmentDetailExcel } from '../utils/exportEnrollmentDetailExcel.js';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function StatusBadge({ status }) {
  const normalized = String(status || 'pending').toLowerCase();
  return (
    <span className={`admin-status-pill admin-status-pill--enrollment admin-status-pill--${normalized}`}>
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function isPdfReceipt(item) {
  if (item.receiptMimeType === 'application/pdf') return true;
  const name = String(item.receiptOriginalName || item.receiptUrl || '');
  return /\.pdf$/i.test(name);
}

function ReceiptThumbLink({ enrollment, size = 'table' }) {
  const src = receiptMediaUrl(enrollment.receiptUrl);
  const pdf = isPdfReceipt(enrollment);
  const [broken, setBroken] = useState(false);

  if (pdf) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className={`admin-enrollment-receipt-thumb admin-enrollment-receipt-thumb--pdf admin-enrollment-receipt-thumb--${size}`}
        title={enrollment.receiptOriginalName || 'Open PDF receipt'}
      >
        <span className="admin-enrollment-receipt-thumb__pdf-mark">PDF</span>
      </a>
    );
  }

  if (!src || broken) {
    return (
      <a className={`admin-enrollment-receipt-fallback admin-enrollment-receipt-thumb--${size}`} href={src} target="_blank" rel="noreferrer">
        View receipt
      </a>
    );
  }

  return (
    <a href={src} target="_blank" rel="noreferrer" className={`admin-enrollment-receipt-thumb admin-enrollment-receipt-thumb--${size}`}>
      <img src={src} alt="Fee receipt preview" loading="lazy" onError={() => setBroken(true)} />
    </a>
  );
}

export default function AdminRegistrationsPage() {
  const token = getAdminToken();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [registrations, setRegistrations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [exportingId, setExportingId] = useState(null);

  const selected = useMemo(
    () => registrations.find((item) => Number(item.id) === Number(selectedId)) || null,
    [registrations, selectedId]
  );

  async function loadRegistrations() {
    try {
      setLoading(true);
      const response = await adminApi.enrollments(token);
      setRegistrations(response?.data || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load registrations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRegistrations();
  }, []);

  async function updateStatus(enrollmentId, status) {
    try {
      setBusyId(enrollmentId);
      setError('');
      setSuccess('');
      const response = await adminApi.updateEnrollmentStatus(token, enrollmentId, { status });
      const updated = response?.data;
      setRegistrations((prev) =>
        prev.map((item) => (Number(item.id) === Number(enrollmentId) ? { ...item, ...updated } : item))
      );
      setSuccess(`Registration ${status} successfully.`);
    } catch (err) {
      setError(err.message || 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  }

  async function exportDetailsExcel(item) {
    try {
      setExportingId(item.id);
      setError('');
      await downloadEnrollmentDetailExcel(item, { formatDate });
      setSuccess('Excel file with full enrollment details downloaded.');
    } catch (err) {
      setError(err?.message || 'Could not export to Excel.');
    } finally {
      setExportingId(null);
    }
  }

  if (loading) return <section className="admin-card">Loading registrations...</section>;

  return (
    <section className="admin-page">
      {error ? <p className="admin-error">{error}</p> : null}
      {success ? <p className="admin-success">{success}</p> : null}

      <section className="admin-card">
        <h2 className="heading-3">Registrations</h2>
        <p className="admin-muted">Review student enrollment records, receipts, and verification status.</p>
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Applicant Name</th>
                <th>WhatsApp</th>
                <th>Province</th>
                <th>Board</th>
                <th>MDCAT Attempt</th>
                <th>Receipt Preview</th>
                <th>Submission Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {registrations.length ? (
                registrations.map((item) => {
                  const receiptHref = receiptMediaUrl(item.receiptUrl);
                  const detailOpen = Number(selectedId) === Number(item.id);
                  return (
                  <tr key={item.id}>
                    <td>{item.applicantFullName}</td>
                    <td>{item.whatsappNumber}</td>
                    <td>{item.province}</td>
                    <td>{item.board}</td>
                    <td>{item.mdcatAttemptType}</td>
                    <td className="admin-enrollment-table__receipt-cell">
                      <ReceiptThumbLink enrollment={item} size="table" />
                    </td>
                    <td>{formatDate(item.submittedAt)}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      <div className="admin-row-actions admin-qa-row-actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          aria-expanded={detailOpen}
                          onClick={() => setSelectedId(detailOpen ? null : item.id)}
                        >
                          {detailOpen ? 'Hide Full Details' : 'View Full Details'}
                        </button>
                        <a className="btn btn--secondary btn--sm" href={receiptHref} target="_blank" rel="noreferrer">
                          Open Receipt
                        </a>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          disabled={Boolean(exportingId)}
                          onClick={() => exportDetailsExcel(item)}
                          title="Download every submitted field for this enrollment as a formatted .xlsx"
                        >
                          {exportingId === item.id ? 'Preparing Excel…' : 'Download Details (Excel)'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={busyId === item.id || item.status === 'verified'}
                          onClick={() => updateStatus(item.id, 'verified')}
                        >
                          Verify Registration
                        </button>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          disabled={busyId === item.id || item.status === 'rejected'}
                          onClick={() => updateStatus(item.id, 'rejected')}
                        >
                          Reject Registration
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9}>No registrations submitted yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className="admin-card">
          <div className="admin-actions">
            <h3 className="heading-4">Registration Detail</h3>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <div className="admin-form-grid" style={{ marginTop: '1rem' }}>
            <Detail label="Applicant Name" value={selected.applicantFullName} />
            <Detail label="Email" value={selected.email} />
            <Detail label="Father Name" value={selected.fatherName} />
            <Detail label="Date of Birth" value={selected.dateOfBirth || '-'} />
            <Detail label="Gender" value={formatGender(selected.gender)} />
            <Detail label="WhatsApp" value={selected.whatsappNumber} />
            <Detail label="Province" value={selected.province} />
            <Detail label="District" value={selected.district} />
            <Detail label="HSSC Status" value={selected.hsscStatus} />
            <Detail label="Board" value={selected.board} />
            <Detail label="MDCAT Attempt" value={selected.mdcatAttemptType} />
            <Detail label="Transaction ID" value={selected.transactionId} />
            <Detail label="Payment Method" value={selected.paymentMethod || '-'} />
            <Detail label="Account Title" value={selected.accountTitle || '-'} />
            <Detail label="Submission Date" value={formatDate(selected.submittedAt)} />
            <Detail
              label="Verification Status"
              value={selected.status ? `${String(selected.status).charAt(0).toUpperCase()}${String(selected.status).slice(1)}` : '-'}
            />
          </div>
          <div className="admin-enrollment-detail-receipt">
            <p className="admin-enrollment-detail-receipt__label">Fee receipt preview</p>
            <ReceiptThumbLink enrollment={selected} size="detail" />
          </div>
        </section>
      ) : null}
    </section>
  );
}

function formatGender(value) {
  if (!value) return '-';
  const normalized = String(value).toLowerCase();
  if (normalized === 'male') return 'Male';
  if (normalized === 'female') return 'Female';
  return value;
}

function Detail({ label, value }) {
  return (
    <div className="admin-field">
      <label>{label}</label>
      <input value={value || '-'} disabled />
    </div>
  );
}
