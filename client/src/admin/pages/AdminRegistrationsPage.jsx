import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { ENROLLMENT_BATCH_OPTIONS, batchLabel } from '../../constants/enrollmentBatches';
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

function formatGenderCell(value) {
  if (!value) return '-';
  const normalized = String(value).toLowerCase();
  if (normalized === 'male') return 'Male';
  if (normalized === 'female') return 'Female';
  return value;
}

function formatOrderStatus(orderStatus, orderId) {
  if (!orderId) return 'No order';
  if (!orderStatus) return 'Unknown';
  const normalized = String(orderStatus).toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatOrderAmount(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '-';
  const num = Number(amount);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(2)} ${currency || 'PKR'}`;
}

function formatLocationSummary(item) {
  return [item?.province, item?.division, item?.district, item?.city].filter(Boolean).join(' / ') || '-';
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

function describeFilters(filters, searchText) {
  const parts = [];
  if (filters.batch !== 'all') {
    parts.push(filters.batch === 'unassigned' ? 'Batch: Unassigned' : `Batch: ${batchLabel(filters.batch)}`);
  }
  if (filters.province !== 'all') parts.push(`Province: ${filters.province}`);
  if (filters.gender !== 'all') parts.push(`Gender: ${filters.gender === 'male' ? 'Male' : 'Female'}`);
  if (filters.status !== 'all') parts.push(`Status: ${filters.status}`);
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

function Detail({ label, value }) {
  return (
    <div className="admin-field">
      <label>{label}</label>
      <input value={value || '-'} disabled />
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
    status: 'all',
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
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 320);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchQuery = useMemo(() => buildEnrollmentAdminQuery(filters, debouncedSearch), [filters, debouncedSearch]);

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
        fileSlug: 'MRB-registration-report',
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
      const batchLabelPiece = filters.batch === 'unassigned' ? 'unassigned-batch' : `batch-${filters.batch}`;
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
          Payment verification now comes from Safepay. Admins only review and approve or reject paid enrollments.
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
              placeholder="Name, father, email, WhatsApp, course"
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <AdminFilterSelect label="Province" value={filters.province} onChange={(v) => setFilters((f) => ({ ...f, province: v }))}>
            <option value="all">All provinces</option>
            {PROVINCE_FILTER_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </AdminFilterSelect>
          <AdminFilterSelect label="Gender" value={filters.gender} onChange={(v) => setFilters((f) => ({ ...f, gender: v }))}>
            <option value="all">Any</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </AdminFilterSelect>
          <AdminFilterSelect label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
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
                : `Export everyone in ${filters.batch === 'unassigned' ? 'Unassigned' : batchLabel(filters.batch)}`
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
                <th>Course</th>
                <th>Email</th>
                <th>WhatsApp</th>
                <th>Province</th>
                <th>Gender</th>
                <th>DOB</th>
                <th>Registration Date</th>
                <th>Order ID</th>
                <th>Payment</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {registrations.length ? (
                registrations.map((item) => {
                  const detailOpen = Number(selectedId) === Number(item.id);
                  return (
                    <tr key={item.id}>
                      <td>
                        <BatchBadge batchNumber={item.batchNumber} />
                      </td>
                      <td>{item.applicantFullName}</td>
                      <td>{item.fatherName}</td>
                      <td>{item.courseTitle || '-'}</td>
                      <td>{item.email}</td>
                      <td>{item.whatsappNumber}</td>
                      <td>{item.province}</td>
                      <td>{formatGenderCell(item.gender)}</td>
                      <td>{formatDateShort(item.dateOfBirth)}</td>
                      <td>{formatDate(item.submittedAt)}</td>
                      <td>{item.orderId ?? '-'}</td>
                      <td>{formatOrderStatus(item.orderStatus, item.orderId)}</td>
                      <td>{formatOrderAmount(item.orderAmount, item.orderCurrency)}</td>
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
                            disabled={busyId === item.id || item.status === 'approved'}
                            onClick={() => updateStatus(item.id, 'approved')}
                          >
                            Approve
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
                  <td colSpan={15} className="admin-registrations-empty">
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
            <h3 className="heading-4">Registration Detail · {selected.batchNumber ? batchLabel(selected.batchNumber) : 'Unassigned'}</h3>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>

          <div className="admin-form-grid" style={{ marginTop: '1rem' }}>
            <Detail label="Applicant Name" value={selected.applicantFullName} />
            <Detail label="Father Name" value={selected.fatherName} />
            <Detail label="Email" value={selected.email} />
            <Detail label="WhatsApp" value={selected.whatsappNumber} />
            <Detail label="Date of Birth" value={selected.dateOfBirth || '-'} />
            <Detail label="Gender" value={formatGenderCell(selected.gender)} />
            <Detail label="Batch Number" value={selected.batchNumber ? batchLabel(selected.batchNumber) : 'Unassigned'} />
            <Detail label="Course" value={selected.courseTitle || '-'} />
            <Detail label="Location" value={formatLocationSummary(selected)} />
            <Detail label="Province" value={selected.province} />
            <Detail label="Division" value={selected.division} />
            <Detail label="District" value={selected.district} />
            <Detail label="City" value={selected.city} />
            <Detail label="HSSC Status" value={selected.hsscStatus} />
            <Detail label="Board" value={selected.board} />
            <Detail label="MDCAT Attempt" value={selected.mdcatAttemptType} />
            <Detail label="Order ID" value={selected.orderId ?? '-'} />
            <Detail label="Payment Status" value={formatOrderStatus(selected.orderStatus, selected.orderId)} />
            <Detail label="Order Amount" value={formatOrderAmount(selected.orderAmount, selected.orderCurrency)} />
            <Detail label="Paid At" value={selected.orderPaidAt ? formatDate(selected.orderPaidAt) : '-'} />
            <Detail label="Enrollment Status" value={selected.status ? `${String(selected.status).charAt(0).toUpperCase()}${String(selected.status).slice(1)}` : '-'} />
            <Detail label="Admin Note" value={selected.adminNote || '-'} />
            <Detail label="Reviewed By" value={selected.reviewedBy ?? '-'} />
            <Detail label="Reviewed At" value={selected.reviewedAt ? formatDate(selected.reviewedAt) : '-'} />
            <Detail label="Submitted At" value={formatDate(selected.submittedAt)} />
          </div>

          <div className="admin-row-actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busyId === selected.id || selected.status === 'approved'}
              onClick={() => updateStatus(selected.id, 'approved')}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={busyId === selected.id || selected.status === 'rejected'}
              onClick={() => updateStatus(selected.id, 'rejected')}
            >
              Reject
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
