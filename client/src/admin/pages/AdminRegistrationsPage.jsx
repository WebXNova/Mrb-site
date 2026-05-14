import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { ENROLLMENT_BATCH_OPTIONS, batchLabel } from '../../constants/enrollmentBatches';
import { receiptMediaUrl } from '../../utils/mediaUrl';
import { downloadBatchRegistrationReportExcel } from '../utils/exportEnrollmentBatchReportExcel.js';
import { downloadEnrollmentDetailExcel } from '../utils/exportEnrollmentDetailExcel.js';
import { buildEnrollmentAdminQuery } from '../utils/enrollmentAdminQuery.js';

const PROVINCE_FILTER_OPTIONS = [
  'Sindh',
  'Punjab',
  'KPK',
  'Balochistan',
  'Gilgit Baltistan',
  'Azad Jammu & Kashmir',
  'Islamabad Capital Territory',
];

const BATCH_CHIP_FILTERS = [
  { id: 'all', label: 'All batches' },
  { id: 'unassigned', label: 'Unassigned' },
  ...ENROLLMENT_BATCH_OPTIONS.map((b) => ({ id: b.value, label: b.label })),
];

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatDateShort(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function StatusBadge({ status }) {
  const normalized = String(status || 'pending').toLowerCase();
  return (
    <span className={`admin-status-pill admin-status-pill--enrollment admin-status-pill--${normalized}`}>
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function BatchBadge({ batchNumber }) {
  if (!batchNumber) {
    return <span className="admin-batch-badge admin-batch-badge--muted">Unassigned</span>;
  }
  return <span className="admin-batch-badge">{batchLabel(batchNumber)}</span>;
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

function describeFilters(filters, searchText) {
  const parts = [];
  if (filters.batch !== 'all') {
    parts.push(
      filters.batch === 'unassigned' ? 'Batch: Unassigned' : `Batch: ${batchLabel(filters.batch)}`
    );
  }
  if (filters.province !== 'all') parts.push(`Province: ${filters.province}`);
  if (filters.gender !== 'all') parts.push(`Gender: ${filters.gender === 'male' ? 'Male' : 'Female'}`);
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`Submitted: ${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`);
  }
  if (searchText) parts.push(`Search: “${searchText}”`);
  return parts.length ? parts.join(' · ') : 'All registrations';
}

function AdminFilterSelect({ label, value, onChange, children }) {
  return (
    <div className="admin-field admin-filter-field">
      <label htmlFor={`reg-filter-${label}`}>{label}</label>
      <select id={`reg-filter-${label}`} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

export default function AdminRegistrationsPage() {
  const token = getAdminToken();
  const seqRef = useRef(0);
  const hasFetchedOnceRef = useRef(false);
  const [registrations, setRegistrations] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [syncingList, setSyncingList] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [exportViewBusy, setExportViewBusy] = useState(false);
  const [exportBatchBusy, setExportBatchBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({
    batch: 'all',
    province: 'all',
    gender: 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const selected = useMemo(
    () => registrations.find((item) => Number(item.id) === Number(selectedId)) || null,
    [registrations, selectedId]
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchQuery = useMemo(
    () => buildEnrollmentAdminQuery(filters, debouncedSearch),
    [filters, debouncedSearch]
  );

  const loadRegistrations = useCallback(async () => {
    const seq = ++seqRef.current;
    if (hasFetchedOnceRef.current) setSyncingList(true);
    setError('');
    try {
      const response = await adminApi.enrollments(token, fetchQuery);
      if (seq !== seqRef.current) return;
      setRegistrations(response?.data || []);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(err.message || 'Failed to load registrations');
      setRegistrations([]);
    } finally {
      if (seq !== seqRef.current) return;
      hasFetchedOnceRef.current = true;
      setSyncingList(false);
      setInitialized(true);
    }
  }, [token, fetchQuery]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

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

  async function exportSingleDetailsExcel(item) {
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

  async function exportCurrentViewExcel() {
    try {
      setExportViewBusy(true);
      setError('');
      if (!registrations.length) throw new Error('No students match the current filters.');
      await downloadBatchRegistrationReportExcel(registrations, {
        formatDate,
        subtitle: `${describeFilters(filters, debouncedSearch)} · Total: ${registrations.length}`,
        fileSlug: `MRB-registration-report`,
      });
      setSuccess('Batch registration Excel downloaded.');
    } catch (err) {
      setError(err?.message || 'Could not build Excel.');
    } finally {
      setExportViewBusy(false);
    }
  }

  async function exportEntireBatchOnly() {
    if (filters.batch === 'all') {
      setError('Pick a batch (or Unassigned) in the tabs above — then export the full batch.');
      return;
    }
    try {
      setExportBatchBusy(true);
      setError('');
      const response = await adminApi.enrollments(token, { batch: filters.batch });
      const rows = response?.data || [];
      if (!rows.length) throw new Error('No students in this batch yet.');
      const batchLabelPiece =
        filters.batch === 'unassigned' ? 'unassigned-batch' : `batch-${filters.batch}`;
      await downloadBatchRegistrationReportExcel(rows, {
        formatDate,
        subtitle: `Batch scope only · Total: ${rows.length} · ${
          filters.batch === 'unassigned' ? 'Unassigned' : batchLabel(filters.batch)
        }`,
        fileSlug: `MRB-${batchLabelPiece}-complete`,
      });
      setSuccess('Entire batch exported to Excel.');
    } catch (err) {
      setError(err?.message || 'Could not export batch.');
    } finally {
      setExportBatchBusy(false);
    }
  }

  if (!initialized) {
    return (
      <section className="admin-page">
        <section className="admin-card admin-registrations-loading">
          <p className="admin-muted admin-registrations-loading__text">Loading registrations…</p>
        </section>
      </section>
    );
  }

  return (
    <section className="admin-page">
      {error ? <p className="admin-error">{error}</p> : null}
      {success ? <p className="admin-success">{success}</p> : null}

      <section className="admin-card">
        <h2 className="heading-3">Registrations</h2>
        <p className="admin-muted">
          Batch workflow matches the Student Q&A subject filter: tap a batch to see only those students — fast, tidy, and
          ready for batch-wise messaging later (notices, lectures, tests).
        </p>

        <div className="admin-tag-board admin-registrations-batch-board" aria-label="Filter by batch">
          {BATCH_CHIP_FILTERS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`admin-tag-chip ${filters.batch === chip.id ? 'admin-tag-chip--active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, batch: chip.id }))}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className={`admin-registrations-filter-grid ${syncingList ? 'admin-registrations-filter-grid--busy' : ''}`}>
          <div className="admin-field admin-filter-field admin-filter-field--grow">
            <label htmlFor="reg-search">Search</label>
            <input
              id="reg-search"
              type="search"
              value={searchInput}
              placeholder="Name, father, email, or WhatsApp"
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <AdminFilterSelect
            label="Province"
            value={filters.province}
            onChange={(v) => setFilters((f) => ({ ...f, province: v }))}
          >
            <option value="all">All provinces</option>
            {PROVINCE_FILTER_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </AdminFilterSelect>
          <AdminFilterSelect
            label="Gender"
            value={filters.gender}
            onChange={(v) => setFilters((f) => ({ ...f, gender: v }))}
          >
            <option value="all">Any</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </AdminFilterSelect>
          <div className="admin-field admin-filter-field">
            <label htmlFor="reg-from">Submitted from</label>
            <input
              id="reg-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </div>
          <div className="admin-field admin-filter-field">
            <label htmlFor="reg-to">Submitted to</label>
            <input
              id="reg-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </div>
        </div>
        <p className="admin-muted admin-registrations-filter-summary">
          Showing {registrations.length} row{registrations.length === 1 ? '' : 's'} · {describeFilters(filters, debouncedSearch)}
          {syncingList ? ' · Updating…' : ''}
        </p>

        <div className="admin-row-actions admin-registrations-export-row">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={exportViewBusy || exportBatchBusy || !registrations.length}
            onClick={exportCurrentViewExcel}
          >
            {exportViewBusy ? 'Preparing Excel…' : 'Download Batch Excel'}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={exportViewBusy || exportBatchBusy || filters.batch === 'all'}
            onClick={exportEntireBatchOnly}
            title={
              filters.batch === 'all'
                ? 'Select a batch chip first.'
                : `Export everyone in ${
                    filters.batch === 'unassigned' ? 'Unassigned' : batchLabel(filters.batch)
                  }`
            }
          >
            {exportBatchBusy ? 'Preparing Excel…' : 'Export Entire Batch'}
          </button>
        </div>

        <div className={`admin-table-wrap admin-table-wrap--registrations ${syncingList ? 'admin-table-wrap--muted' : ''}`}>
          <table className="admin-table admin-table--registrations">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Student Name</th>
                <th>Father Name</th>
                <th>Email</th>
                <th>WhatsApp</th>
                <th>Province</th>
                <th>Gender</th>
                <th>DOB</th>
                <th>Registration Date</th>
                <th>Receipt</th>
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
                      <td>
                        <BatchBadge batchNumber={item.batchNumber} />
                      </td>
                      <td>{item.applicantFullName}</td>
                      <td>{item.fatherName}</td>
                      <td>{item.email}</td>
                      <td>{item.whatsappNumber}</td>
                      <td>{item.province}</td>
                      <td>{formatGenderCell(item.gender)}</td>
                      <td>{formatDateShort(item.dateOfBirth)}</td>
                      <td>{formatDate(item.submittedAt)}</td>
                      <td className="admin-enrollment-table__receipt-cell">
                        <ReceiptThumbLink enrollment={item} size="table" />
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td>
                        <div className="admin-row-actions admin-registrations-actions-stack">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            aria-expanded={detailOpen}
                            onClick={() => setSelectedId(detailOpen ? null : item.id)}
                          >
                            {detailOpen ? 'Hide' : 'Details'}
                          </button>
                          <a className="btn btn--secondary btn--sm" href={receiptHref} target="_blank" rel="noreferrer">
                            Receipt
                          </a>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={Boolean(exportingId)}
                            onClick={() => exportSingleDetailsExcel(item)}
                            title="Full single-record Excel"
                          >
                            {exportingId === item.id ? 'Excel…' : 'Detail Excel'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={busyId === item.id || item.status === 'verified'}
                            onClick={() => updateStatus(item.id, 'verified')}
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={busyId === item.id || item.status === 'rejected'}
                            onClick={() => updateStatus(item.id, 'rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={12} className="admin-registrations-empty">
                    {syncingList ? 'Refreshing list…' : 'No registrations match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className="admin-card admin-registrations-detail">
          <div className="admin-actions">
            <h3 className="heading-4">Registration Detail · {batchLabel(selected.batchNumber) || 'Unassigned'}</h3>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <div className="admin-form-grid" style={{ marginTop: '1rem' }}>
            <Detail label="Applicant Name" value={selected.applicantFullName} />
            <Detail label="Email" value={selected.email} />
            <Detail label="Father Name" value={selected.fatherName} />
            <Detail label="Date of Birth" value={selected.dateOfBirth || '-'} />
            <Detail label="Gender" value={formatGenderCell(selected.gender)} />
            <Detail label="Batch Number" value={selected.batchNumber ? batchLabel(selected.batchNumber) : 'Unassigned'} />
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
              value={
                selected.status ? `${String(selected.status).charAt(0).toUpperCase()}${String(selected.status).slice(1)}` : '-'
              }
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

function formatGenderCell(value) {
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
