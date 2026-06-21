import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { locationsApi } from '../../api/locationsApi';
import { getAdminToken } from '../../auth/session';
import AdminHierarchySelectors from '../../components/admin/AdminHierarchySelectors';
import { useAdminHierarchyCascade } from '../../components/admin/useAdminHierarchyCascade';
import { useIsMobileNav } from '../hooks/useMediaQuery';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { downloadBatchRegistrationReportExcel } from '../utils/exportEnrollmentBatchReportExcel.js';
import { downloadEnrollmentDetailExcel } from '../utils/exportEnrollmentDetailExcel.js';
import {
  readAdminFiltersFromUrl,
  writeAdminFiltersToUrl,
} from '../utils/adminListFilterQuery.js';
import {
  DEFAULT_ENROLLMENT_FILTERS,
  buildEnrollmentAdminQuery,
} from '../utils/enrollmentAdminQuery.js';
import {
  ENROLLMENT_FIELD_SECTIONS,
  formatEnrollmentGender,
  formatEnrollmentOrderAmount,
  formatEnrollmentOrderStatus,
  formatEnrollmentDate,
  formatEnrollmentDateShort,
  formatEnrollmentField,
} from '../utils/enrollmentFieldRegistry.js';

const PAYMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'Any payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid (order exists)' },
  { value: 'no_order', label: 'No order yet' },
];

function describeFilters(filters, searchText, lookups) {
  const parts = [];
  if (filters.course !== 'all' && lookups?.courseTitle) parts.push(`Course: ${lookups.courseTitle}`);
  if (filters.gender !== 'all') parts.push(`Gender: ${filters.gender === 'male' ? 'Male' : 'Female'}`);
  if (filters.status !== 'all') parts.push(`Status: ${filters.status}`);
  if (filters.payment !== 'all') {
    const label = PAYMENT_FILTER_OPTIONS.find((o) => o.value === filters.payment)?.label || filters.payment;
    parts.push(`Payment: ${label}`);
  }
  if (filters.provinceId !== 'all' && lookups?.provinceName) parts.push(`Province: ${lookups.provinceName}`);
  if (filters.districtId !== 'all' && lookups?.districtName) parts.push(`District: ${lookups.districtName}`);
  if (filters.cityId !== 'all' && lookups?.cityName) parts.push(`City: ${lookups.cityName}`);
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`Submitted: ${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`);
  }
  if (searchText) parts.push(`Search: “${searchText}”`);
  return parts.length ? parts.join(' · ') : 'All registrations';
}

function countActiveFilters(filters, searchText) {
  let count = 0;
  if (filters.course !== 'all') count += 1;
  if (filters.subjectId !== 'all') count += 1;
  if (filters.chapterId !== 'all') count += 1;
  if (filters.status !== 'all') count += 1;
  if (filters.payment !== 'all') count += 1;
  if (filters.gender !== 'all') count += 1;
  if (filters.provinceId !== 'all') count += 1;
  if (filters.districtId !== 'all') count += 1;
  if (filters.cityId !== 'all') count += 1;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  if (searchText) count += 1;
  return count;
}

function hasAnyFilters(filters, searchText) {
  return countActiveFilters(filters, searchText) > 0;
}

function StatusBadge({ status }) {
  const normalized = String(status || 'pending').toLowerCase();
  return (
    <span className={`admin-status-pill admin-status-pill--enrollment admin-status-pill--${normalized}`}>
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function AccessBadge({ accessStatus }) {
  const normalized = String(accessStatus || 'inactive').toLowerCase();
  return (
    <span className={`admin-access-badge admin-access-badge--${normalized}`}>
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function AccountBadge({ accountStatus }) {
  if (!accountStatus) return <span className="admin-account-badge admin-account-badge--unknown">Unknown</span>;
  const normalized = String(accountStatus).toLowerCase();
  return (
    <span className={`admin-account-badge admin-account-badge--${normalized}`}>
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function AdminFilterSelect({ label, value, onChange, children, disabled = false }) {
  return (
    <div className="admin-field admin-filter-field">
      <label htmlFor={`reg-filter-${label}`}>{label}</label>
      <select
        id={`reg-filter-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {children}
      </select>
    </div>
  );
}

function StatTile({ label, value, tone = 'neutral', onClick, active = false }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`admin-reg-stat admin-reg-stat--${tone} ${active ? 'admin-reg-stat--active' : ''} ${
        onClick ? 'admin-reg-stat--clickable' : ''
      }`}
    >
      <span className="admin-reg-stat__value">{value}</span>
      <span className="admin-reg-stat__label">{label}</span>
    </Tag>
  );
}

function DetailField({ label, value }) {
  return (
    <div className="admin-field admin-enrollment-detail__field">
      <label>{label}</label>
      <input value={value || '-'} disabled readOnly />
    </div>
  );
}

function buildWhatsAppHref(rawNumber) {
  const digits = String(rawNumber || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

function RegistrationActions({
  item,
  detailOpen,
  approveBlocked,
  busyId,
  exportingId,
  onToggleDetail,
  onExport,
  onApprove,
  onReject,
}) {
  return (
    <div className="admin-row-actions admin-reg-actions">
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        aria-expanded={detailOpen}
        onClick={onToggleDetail}
      >
        {detailOpen ? 'Hide' : 'Details'}
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        disabled={Boolean(exportingId)}
        onClick={onExport}
        title="Full single-record Excel"
      >
        {exportingId === item.id ? 'Excel…' : 'Excel'}
      </button>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={busyId === item.id || Boolean(approveBlocked) || item.status === 'approved'}
        onClick={onApprove}
        title={approveBlocked || 'Approve this paid registration'}
      >
        Approve
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        disabled={busyId === item.id || item.status === 'rejected'}
        onClick={onReject}
      >
        Reject
      </button>
    </div>
  );
}

function RegistrationMobileCard({
  item,
  detailOpen,
  approveBlocked,
  busyId,
  exportingId,
  highlight,
  onToggleDetail,
  onExport,
  onApprove,
  onReject,
}) {
  const whatsappHref = buildWhatsAppHref(item.whatsappNumber);
  const locationLine = [item.province, item.district, item.city].filter(Boolean).join(' / ');

  return (
    <article className={`admin-reg-mobile-card${highlight ? ' admin-reg-mobile-card--paid-pending' : ''}`}>
      <header className="admin-reg-mobile-card__header">
        <div>
          <h3 className="admin-reg-mobile-card__title">{item.applicantFullName || 'Unknown student'}</h3>
          <p className="admin-reg-mobile-card__subtitle">{item.fatherName || '—'}</p>
        </div>
        <StatusBadge status={item.status} />
      </header>
      <p className="admin-reg-mobile-card__course">{item.courseTitle || 'No course'}</p>
      <dl className="admin-reg-mobile-card__meta">
        <div>
          <dt>Payment</dt>
          <dd>{formatEnrollmentOrderStatus(item.orderStatus, item.orderId)}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{formatEnrollmentOrderAmount(item.orderAmount, item.orderCurrency)}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd><AccessBadge accessStatus={item.accessStatus} /></dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd><AccountBadge accountStatus={item.userAccountStatus} /></dd>
        </div>
        <div className="admin-reg-mobile-card__meta-span">
          <dt>Location</dt>
          <dd>
            {item.province || '—'}
            {locationLine ? ` · ${locationLine}` : ''}
          </dd>
        </div>
        <div className="admin-reg-mobile-card__meta-span">
          <dt>Contact</dt>
          <dd className="admin-reg-mobile-card__contact">
            {item.email ? (
              <a href={`mailto:${item.email}`} className="admin-reg-link">
                {item.email}
              </a>
            ) : (
              'No email'
            )}
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="admin-reg-link">
                WhatsApp
              </a>
            ) : null}
          </dd>
        </div>
      </dl>
      <RegistrationActions
        item={item}
        detailOpen={detailOpen}
        approveBlocked={approveBlocked}
        busyId={busyId}
        exportingId={exportingId}
        onToggleDetail={onToggleDetail}
        onExport={onExport}
        onApprove={onApprove}
        onReject={onReject}
      />
    </article>
  );
}

export default function AdminRegistrationsPage() {
  const token = getAdminToken();
  const isMobileNav = useIsMobileNav();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersReady, setFiltersReady] = useState(false);
  const urlHydratedRef = useRef(false);
  const detailRef = useRef(null);
  const seqRef = useRef(0);
  const summarySeqRef = useRef(0);
  const hasFetchedOnceRef = useRef(false);
  const [registrations, setRegistrations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [courses, setCourses] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [syncingList, setSyncingList] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [exportViewBusy, setExportViewBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [adminNoteDraft, setAdminNoteDraft] = useState('');
  const [filters, setFilters] = useState({ ...DEFAULT_ENROLLMENT_FILTERS });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const sharedCourses = useMemo(
    () => ({
      courses: courses.map((c) => ({ id: c.id, title: c.title })),
      isLoadingCourses: false,
    }),
    [courses]
  );

  const hierarchyCascade = useAdminHierarchyCascade({
    token,
    depth: 3,
    sharedCourses,
  });

  const {
    selectedCourseId,
    selectedSubjectId,
    selectedChapterId,
    selectCourse,
    selectSubject,
    selectChapter,
    applyHierarchySelection,
  } = hierarchyCascade;

  const activeFilterCount = useMemo(
    () => countActiveFilters(filters, debouncedSearch),
    [filters, debouncedSearch]
  );

  const selected = useMemo(
    () => registrations.find((item) => Number(item.id) === Number(selectedId)) || null,
    [registrations, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    setAdminNoteDraft(selected.adminNote || '');
  }, [selected?.id, selected?.adminNote]);

  useEffect(() => {
    if (!selected || !isMobileNav) return;
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected?.id, isMobileNav]);

  useEffect(() => {
    if (!isMobileNav) setFiltersExpanded(true);
  }, [isMobileNav]);

  useEffect(() => {
    if (urlHydratedRef.current) return;
    const urlFilters = readAdminFiltersFromUrl(searchParams);
    setFilters((prev) => ({
      ...prev,
      course: urlFilters.courseId || prev.course,
      subjectId: urlFilters.subjectId || prev.subjectId,
      chapterId: urlFilters.chapterId || prev.chapterId,
      dateFrom: urlFilters.dateFrom || prev.dateFrom,
      dateTo: urlFilters.dateTo || prev.dateTo,
      status: urlFilters.status !== 'all' ? urlFilters.status : prev.status,
    }));
    if (urlFilters.search) setSearchInput(urlFilters.search);
    if (urlFilters.courseId || urlFilters.subjectId || urlFilters.chapterId) {
      applyHierarchySelection({
        courseId: urlFilters.courseId,
        subjectId: urlFilters.subjectId,
        chapterId: urlFilters.chapterId,
      });
    }
    urlHydratedRef.current = true;
    setFiltersReady(true);
  }, [searchParams, applyHierarchySelection]);

  useEffect(() => {
    if (!filtersReady) return;
    setSearchParams(
      writeAdminFiltersToUrl(new URLSearchParams(), {
        courseId: filters.course !== 'all' ? filters.course : '',
        subjectId: filters.subjectId !== 'all' ? filters.subjectId : '',
        chapterId: filters.chapterId !== 'all' ? filters.chapterId : '',
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: debouncedSearch,
        status: filters.status,
      }),
      { replace: true }
    );
  }, [
    filtersReady,
    filters.course,
    filters.subjectId,
    filters.chapterId,
    filters.dateFrom,
    filters.dateTo,
    filters.status,
    debouncedSearch,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!filtersReady) return;
    setFilters((prev) => {
      const nextCourse = selectedCourseId || 'all';
      const nextSubject = selectedSubjectId || 'all';
      const nextChapter = selectedChapterId || 'all';
      if (
        prev.course === nextCourse &&
        prev.subjectId === nextSubject &&
        prev.chapterId === nextChapter
      ) {
        return prev;
      }
      return { ...prev, course: nextCourse, subjectId: nextSubject, chapterId: nextChapter };
    });
  }, [selectedCourseId, selectedSubjectId, selectedChapterId, filtersReady]);

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

  const loadSummary = useCallback(async () => {
    const seq = ++summarySeqRef.current;
    try {
      const response = await adminApi.enrollmentsSummary(token);
      if (seq !== summarySeqRef.current) return;
      setSummary(response?.data || null);
    } catch {
      if (seq !== summarySeqRef.current) return;
      setSummary(null);
    }
  }, [token]);

  const loadCourses = useCallback(async () => {
    try {
      const response = await adminApi.courses(token);
      const list = (response?.data || []).map((c) => ({
        id: Number(c.id),
        title: c.title,
      }));
      list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
      setCourses(list);
    } catch {
      // Course chip row is best-effort.
    }
  }, [token]);

  const loadProvinces = useCallback(async () => {
    try {
      const response = await locationsApi.provinces();
      const list = (response?.data || []).map((p) => ({ id: Number(p.id), name: p.name }));
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      setProvinces(list);
    } catch {
      setProvinces([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 320);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!filtersReady) return;
    loadRegistrations();
  }, [loadRegistrations, filtersReady]);

  useEffect(() => {
    if (!token) return;
    loadSummary();
    loadCourses();
    loadProvinces();
  }, [token, loadSummary, loadCourses, loadProvinces]);

  // Cascade — load districts when province changes (and reset deeper levels).
  useEffect(() => {
    let cancelled = false;
    if (filters.provinceId === 'all') {
      setDistricts([]);
      return undefined;
    }
    (async () => {
      try {
        const response = await locationsApi.districts(filters.provinceId);
        if (cancelled) return;
        const list = (response?.data || []).map((d) => ({ id: Number(d.id), name: d.name }));
        list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        setDistricts(list);
      } catch {
        if (!cancelled) setDistricts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.provinceId]);

  useEffect(() => {
    let cancelled = false;
    if (filters.districtId === 'all') {
      setCities([]);
      return undefined;
    }
    (async () => {
      try {
        const response = await locationsApi.cities(filters.districtId);
        if (cancelled) return;
        const list = (response?.data || []).map((c) => ({ id: Number(c.id), name: c.name }));
        list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        setCities(list);
      } catch {
        if (!cancelled) setCities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.districtId]);

  const courseTitleById = useMemo(() => {
    const lookup = new Map();
    courses.forEach((c) => lookup.set(String(c.id), c.title));
    return lookup;
  }, [courses]);

  const provinceNameById = useMemo(() => {
    const lookup = new Map();
    provinces.forEach((p) => lookup.set(String(p.id), p.name));
    return lookup;
  }, [provinces]);

  const districtNameById = useMemo(() => {
    const lookup = new Map();
    districts.forEach((d) => lookup.set(String(d.id), d.name));
    return lookup;
  }, [districts]);

  const cityNameById = useMemo(() => {
    const lookup = new Map();
    cities.forEach((c) => lookup.set(String(c.id), c.name));
    return lookup;
  }, [cities]);

  const filterLookups = useMemo(
    () => ({
      courseTitle: filters.course !== 'all' ? courseTitleById.get(String(filters.course)) || null : null,
      provinceName: filters.provinceId !== 'all' ? provinceNameById.get(String(filters.provinceId)) || null : null,
      districtName: filters.districtId !== 'all' ? districtNameById.get(String(filters.districtId)) || null : null,
      cityName: filters.cityId !== 'all' ? cityNameById.get(String(filters.cityId)) || null : null,
    }),
    [
      filters.course,
      filters.provinceId,
      filters.districtId,
      filters.cityId,
      courseTitleById,
      provinceNameById,
      districtNameById,
      cityNameById,
    ]
  );

  function applyFilters(patch) {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'course') && patch.course !== prev.course) {
        next.subjectId = 'all';
        next.chapterId = 'all';
      } else if (Object.prototype.hasOwnProperty.call(patch, 'subjectId') && patch.subjectId !== prev.subjectId) {
        next.chapterId = 'all';
      }
      // Cascading reset: changing a parent location must clear deeper levels.
      if (Object.prototype.hasOwnProperty.call(patch, 'provinceId') && patch.provinceId !== prev.provinceId) {
        next.districtId = 'all';
        next.cityId = 'all';
      } else if (Object.prototype.hasOwnProperty.call(patch, 'districtId') && patch.districtId !== prev.districtId) {
        next.cityId = 'all';
      }
      return next;
    });

    if (Object.prototype.hasOwnProperty.call(patch, 'course')) {
      selectCourse(patch.course === 'all' ? '' : String(patch.course));
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'subjectId')) {
      selectSubject(patch.subjectId === 'all' ? '' : String(patch.subjectId));
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'chapterId')) {
      selectChapter(patch.chapterId === 'all' ? '' : String(patch.chapterId));
    }
  }

  function resetFilters() {
    setFilters({ ...DEFAULT_ENROLLMENT_FILTERS });
    setSearchInput('');
    setDebouncedSearch('');
    selectCourse('');
  }

  function handleSelectStatPreset(preset) {
    if (preset === 'pending') applyFilters({ status: 'pending', payment: 'all' });
    else if (preset === 'paidPendingReview') applyFilters({ status: 'pending', payment: 'paid' });
    else if (preset === 'approved') applyFilters({ status: 'approved' });
    else if (preset === 'rejected') applyFilters({ status: 'rejected' });
    else if (preset === 'noOrder') applyFilters({ payment: 'no_order' });
  }

  async function refreshAll() {
    await Promise.all([loadRegistrations(), loadSummary()]);
  }

  function approveDisabledReason(item) {
    if (!item) return null;
    if (item.status === 'approved') return 'Already approved.';
    if (!item.orderId) return 'Cannot approve until the student has linked a paid order.';
    if (String(item.orderStatus || '').toLowerCase() !== 'paid') return 'Cannot approve until the order is paid.';
    return null;
  }

  async function approveEnrollment(item) {
    const reason = approveDisabledReason(item);
    if (reason) {
      setError(reason);
      return;
    }
    try {
      setBusyId(item.id);
      setError('');
      setSuccess('');
      const response = await adminApi.updateEnrollmentStatus(token, item.id, {
        status: 'approved',
        adminNote: adminNoteDraft && adminNoteDraft.trim() ? adminNoteDraft.trim() : null,
      });
      const updated = response?.data;
      setRegistrations((prev) =>
        prev.map((row) => (Number(row.id) === Number(item.id) ? { ...row, ...updated } : row))
      );
      setSuccess(`Registration #${item.id} approved successfully.`);
      loadSummary();
    } catch (err) {
      setError(err.message || 'Failed to approve registration.');
    } finally {
      setBusyId(null);
    }
  }

  function openRejectConfirm(item) {
    setError('');
    setConfirmDialog({
      kind: 'reject',
      enrollmentId: item.id,
      title: 'Reject this registration?',
      message:
        'The student will lose course access if it was active and this action cannot be silently undone. Add a clear reason below.',
      confirmLabel: 'Reject registration',
      danger: true,
      noteRequired: true,
      note: adminNoteDraft || '',
    });
  }

  function openSuspendConfirm(item) {
    setError('');
    setConfirmDialog({
      kind: 'suspend',
      enrollmentId: item.id,
      title: 'Suspend this student?',
      message:
        'This locks the student account, revokes active sessions, and rejects this enrollment. Provide an internal note explaining why.',
      confirmLabel: 'Suspend student',
      danger: true,
      noteRequired: true,
      note: adminNoteDraft || '',
    });
  }

  async function applyConfirmAction() {
    if (!confirmDialog) return;
    const note = String(confirmDialog.note || '').trim();
    if (confirmDialog.noteRequired && note.length < 3) {
      setConfirmDialog((prev) => (prev ? { ...prev, error: 'Admin note must be at least 3 characters.' } : prev));
      return;
    }
    try {
      setConfirmBusy(true);
      if (confirmDialog.kind === 'reject') {
        const response = await adminApi.updateEnrollmentStatus(token, confirmDialog.enrollmentId, {
          status: 'rejected',
          adminNote: note,
        });
        const updated = response?.data;
        setRegistrations((prev) =>
          prev.map((row) =>
            Number(row.id) === Number(confirmDialog.enrollmentId) ? { ...row, ...updated } : row
          )
        );
        setSuccess(`Registration #${confirmDialog.enrollmentId} rejected.`);
      } else if (confirmDialog.kind === 'suspend') {
        const response = await adminApi.suspendEnrollmentStudent(token, confirmDialog.enrollmentId, {
          adminNote: note,
        });
        const updated = response?.data;
        setRegistrations((prev) =>
          prev.map((row) =>
            Number(row.id) === Number(confirmDialog.enrollmentId)
              ? { ...row, ...updated, userAccountStatus: 'suspended' }
              : row
          )
        );
        setSuccess(`Student linked to enrollment #${confirmDialog.enrollmentId} suspended.`);
      }
      setConfirmDialog(null);
      loadSummary();
    } catch (err) {
      setConfirmDialog((prev) => (prev ? { ...prev, error: err.message || 'Action failed.' } : prev));
    } finally {
      setConfirmBusy(false);
    }
  }

  async function exportSingleDetailsExcel(item) {
    try {
      setExportingId(item.id);
      setError('');
      await downloadEnrollmentDetailExcel(item, { formatDate: formatEnrollmentDate });
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
        formatDate: formatEnrollmentDate,
        subtitle: `${describeFilters(filters, debouncedSearch, filterLookups)} · Total: ${registrations.length}`,
        fileSlug: 'MRB-registration-report',
      });
      setSuccess('Registration Excel downloaded.');
    } catch (err) {
      setError(err?.message || 'Could not build Excel.');
    } finally {
      setExportViewBusy(false);
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

  const isPaidPendingHighlight = (item) =>
    String(item.status).toLowerCase() === 'pending' &&
    String(item.orderStatus || '').toLowerCase() === 'paid';

  return (
    <section className="admin-page">
      {error ? <p className="admin-error">{error}</p> : null}
      {success ? <p className="admin-success">{success}</p> : null}

      <section className="admin-card">
        <div className="admin-actions admin-reg-page-head">
          <div>
            <h2 className="heading-3">Registrations</h2>
            <p className="admin-muted">
              Payment verification comes from Safepay. Approve paid enrollments, reject with a reason, or suspend students who
              violate policy.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={refreshAll}
            disabled={syncingList}
          >
            {syncingList ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="admin-reg-stat-grid">
          <StatTile
            label="Pending review"
            value={summary?.pending ?? '—'}
            tone="warning"
            onClick={() => handleSelectStatPreset('pending')}
            active={filters.status === 'pending' && filters.payment === 'all'}
          />
          <StatTile
            label="Paid · awaiting approval"
            value={summary?.paidPendingReview ?? '—'}
            tone="primary"
            onClick={() => handleSelectStatPreset('paidPendingReview')}
            active={filters.status === 'pending' && filters.payment === 'paid'}
          />
          <StatTile
            label="Approved"
            value={summary?.approved ?? '—'}
            tone="success"
            onClick={() => handleSelectStatPreset('approved')}
            active={filters.status === 'approved'}
          />
          <StatTile
            label="Rejected"
            value={summary?.rejected ?? '—'}
            tone="danger"
            onClick={() => handleSelectStatPreset('rejected')}
            active={filters.status === 'rejected'}
          />
          <StatTile
            label="No order yet"
            value={summary?.noOrder ?? '—'}
            tone="muted"
            onClick={() => handleSelectStatPreset('noOrder')}
            active={filters.payment === 'no_order'}
          />
          <StatTile label="Total registrations" value={summary?.total ?? '—'} tone="neutral" />
        </div>

        <div className="admin-registrations-course-board-wrap">
          <p className="admin-reg-section-label">Course</p>
          <div className="admin-tag-board admin-registrations-course-board" aria-label="Filter by course">
            <button
              type="button"
              className={`admin-tag-chip ${filters.course === 'all' ? 'admin-tag-chip--active' : ''}`}
              onClick={() => applyFilters({ course: 'all' })}
            >
              All courses
            </button>
            {courses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={`admin-tag-chip ${
                  String(filters.course) === String(course.id) ? 'admin-tag-chip--active' : ''
                }`}
                onClick={() => applyFilters({ course: String(course.id) })}
                title={course.title}
              >
                {course.title}
              </button>
            ))}
            {courses.length === 0 ? (
              <span className="admin-muted admin-registrations-course-board__hint">
                No courses available yet.
              </span>
            ) : null}
          </div>
        </div>

        <div className="admin-reg-filters-wrap">
          <button
            type="button"
            className="admin-reg-filters-toggle btn btn--secondary btn--sm"
            aria-expanded={filtersExpanded}
            aria-controls="reg-filters-panel"
            onClick={() => setFiltersExpanded((open) => !open)}
          >
            {filtersExpanded ? 'Hide filters' : 'Show filters'}
            {activeFilterCount > 0 ? (
              <span className="admin-reg-filters-toggle__badge">{activeFilterCount}</span>
            ) : null}
          </button>

          <div
            id="reg-filters-panel"
            className={`admin-reg-filters-panel ${filtersExpanded ? 'admin-reg-filters-panel--open' : ''} ${
              syncingList ? 'admin-reg-filters-panel--busy' : ''
            }`}
          >
            <div className="admin-reg-filters-section">
              <p className="admin-reg-filters-section__label">Course hierarchy</p>
              <div className="admin-registrations-filter-grid admin-registrations-filter-grid--primary">
                <AdminHierarchySelectors
                  cascade={hierarchyCascade}
                  depth={3}
                  idPrefix={{ course: 'regCourse', subject: 'regSubject', chapter: 'regChapter' }}
                />
              </div>
            </div>

            <div className="admin-reg-filters-section">
              <p className="admin-reg-filters-section__label">Search &amp; status</p>
              <div className="admin-registrations-filter-grid admin-registrations-filter-grid--primary">
                <div className="admin-field admin-filter-field admin-filter-field--search">
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
                <AdminFilterSelect
                  label="Payment"
                  value={filters.payment}
                  onChange={(v) => applyFilters({ payment: v })}
                >
                  {PAYMENT_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </AdminFilterSelect>
                <AdminFilterSelect label="Gender" value={filters.gender} onChange={(v) => applyFilters({ gender: v })}>
                  <option value="all">Any</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </AdminFilterSelect>
                <AdminFilterSelect label="Status" value={filters.status} onChange={(v) => applyFilters({ status: v })}>
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
                    onChange={(e) => applyFilters({ dateFrom: e.target.value })}
                  />
                </div>
                <div className="admin-field admin-filter-field">
                  <label htmlFor="reg-to">Submitted to</label>
                  <input
                    id="reg-to"
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => applyFilters({ dateTo: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="admin-reg-filters-section">
              <p className="admin-reg-filters-section__label">Location</p>
              <div className="admin-registrations-filter-grid admin-registrations-filter-grid--location">
                <AdminFilterSelect
                  label="Province"
                  value={filters.provinceId}
                  onChange={(v) => applyFilters({ provinceId: v })}
                >
                  <option value="all">All provinces</option>
                  {provinces.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </AdminFilterSelect>
                <AdminFilterSelect
                  label="District"
                  value={filters.districtId}
                  onChange={(v) => applyFilters({ districtId: v })}
                  disabled={filters.provinceId === 'all'}
                >
                  <option value="all">
                    {filters.provinceId === 'all' ? 'Pick a province first' : 'All districts'}
                  </option>
                  {districts.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </AdminFilterSelect>
                <AdminFilterSelect
                  label="City"
                  value={filters.cityId}
                  onChange={(v) => applyFilters({ cityId: v })}
                  disabled={filters.districtId === 'all'}
                >
                  <option value="all">
                    {filters.districtId === 'all' ? 'Pick a district first' : 'All cities'}
                  </option>
                  {cities.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </AdminFilterSelect>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-reg-toolbar">
          <div className="admin-reg-toolbar__left">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={resetFilters}
              disabled={!hasAnyFilters(filters, debouncedSearch)}
            >
              Clear filters
            </button>
            <p className="admin-muted admin-registrations-filter-summary">
              <strong>{registrations.length}</strong> row{registrations.length === 1 ? '' : 's'}
              {' · '}
              {describeFilters(filters, debouncedSearch, filterLookups)}
              {syncingList ? ' · Updating…' : ''}
            </p>
          </div>
          <div className="admin-reg-toolbar__right">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={exportViewBusy || !registrations.length}
              onClick={exportCurrentViewExcel}
            >
              {exportViewBusy ? 'Preparing…' : 'Download Excel'}
            </button>
          </div>
        </div>

        <div className={`admin-reg-table-desktop admin-table-wrap admin-table-wrap--registrations ${syncingList ? 'admin-table-wrap--muted' : ''}`}>
          <table className="admin-table admin-table--registrations">
            <thead>
              <tr>
                <th className="admin-reg-col--student">Student</th>
                <th className="admin-reg-col--course">Course</th>
                <th className="admin-reg-col--email">Email</th>
                <th className="admin-reg-col--whatsapp">WhatsApp</th>
                <th className="admin-reg-col--location">Location</th>
                <th className="admin-reg-col--gender">Gender</th>
                <th className="admin-reg-col--dob">DOB</th>
                <th className="admin-reg-col--submitted">Submitted</th>
                <th className="admin-reg-col--order">Order</th>
                <th className="admin-reg-col--payment">Payment</th>
                <th className="admin-reg-col--amount">Amount</th>
                <th className="admin-reg-col--status">Status</th>
                <th className="admin-reg-col--access">Access</th>
                <th className="admin-reg-col--account">Account</th>
                <th className="admin-reg-col--actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {registrations.length ? (
                registrations.map((item) => {
                  const detailOpen = Number(selectedId) === Number(item.id);
                  const approveBlocked = approveDisabledReason(item);
                  const whatsappHref = buildWhatsAppHref(item.whatsappNumber);
                  return (
                    <tr
                      key={item.id}
                      className={isPaidPendingHighlight(item) ? 'admin-reg-row admin-reg-row--paid-pending' : 'admin-reg-row'}
                    >
                      <td className="admin-reg-col--student">
                        <div className="admin-reg-cell-stack">
                          <strong>{item.applicantFullName || '-'}</strong>
                          <span className="admin-muted">{item.fatherName || '-'}</span>
                        </div>
                      </td>
                      <td className="admin-reg-col--course">{item.courseTitle || '-'}</td>
                      <td className="admin-reg-col--email">
                        {item.email ? (
                          <a href={`mailto:${item.email}`} className="admin-reg-link">
                            {item.email}
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="admin-reg-col--whatsapp">
                        {whatsappHref ? (
                          <a href={whatsappHref} target="_blank" rel="noreferrer" className="admin-reg-link">
                            {item.whatsappNumber}
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="admin-reg-col--location">
                        <div className="admin-reg-cell-stack">
                          <span>{item.province || '-'}</span>
                          <span className="admin-muted">
                            {[item.province, item.district, item.city].filter(Boolean).join(' / ') || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="admin-reg-col--gender">{formatEnrollmentGender(item.gender)}</td>
                      <td className="admin-reg-col--dob">{formatEnrollmentDateShort(item.dateOfBirth)}</td>
                      <td className="admin-reg-col--submitted">{formatEnrollmentDate(item.submittedAt)}</td>
                      <td className="admin-reg-col--order">{item.orderId ?? '-'}</td>
                      <td className="admin-reg-col--payment">{formatEnrollmentOrderStatus(item.orderStatus, item.orderId)}</td>
                      <td className="admin-reg-col--amount">{formatEnrollmentOrderAmount(item.orderAmount, item.orderCurrency)}</td>
                      <td className="admin-reg-col--status">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="admin-reg-col--access">
                        <AccessBadge accessStatus={item.accessStatus} />
                      </td>
                      <td className="admin-reg-col--account">
                        <AccountBadge accountStatus={item.userAccountStatus} />
                      </td>
                      <td className="admin-reg-col--actions">
                        <RegistrationActions
                          item={item}
                          detailOpen={detailOpen}
                          approveBlocked={approveBlocked}
                          busyId={busyId}
                          exportingId={exportingId}
                          onToggleDetail={() => setSelectedId(detailOpen ? null : item.id)}
                          onExport={() => exportSingleDetailsExcel(item)}
                          onApprove={() => approveEnrollment(item)}
                          onReject={() => openRejectConfirm(item)}
                        />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={15} className="admin-registrations-empty">
                    {syncingList
                      ? 'Refreshing list…'
                      : hasAnyFilters(filters, debouncedSearch)
                        ? 'No registrations match these filters. Try clearing filters.'
                        : 'No registrations yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={`admin-reg-mobile-list ${syncingList ? 'admin-reg-mobile-list--muted' : ''}`}>
          {registrations.length ? (
            registrations.map((item) => {
              const detailOpen = Number(selectedId) === Number(item.id);
              const approveBlocked = approveDisabledReason(item);
              return (
                <RegistrationMobileCard
                  key={item.id}
                  item={item}
                  detailOpen={detailOpen}
                  approveBlocked={approveBlocked}
                  busyId={busyId}
                  exportingId={exportingId}
                  highlight={isPaidPendingHighlight(item)}
                  onToggleDetail={() => setSelectedId(detailOpen ? null : item.id)}
                  onExport={() => exportSingleDetailsExcel(item)}
                  onApprove={() => approveEnrollment(item)}
                  onReject={() => openRejectConfirm(item)}
                />
              );
            })
          ) : (
            <p className="admin-registrations-empty admin-reg-mobile-empty">
              {syncingList
                ? 'Refreshing list…'
                : hasAnyFilters(filters, debouncedSearch)
                  ? 'No registrations match these filters. Try clearing filters.'
                  : 'No registrations yet.'}
            </p>
          )}
        </div>
      </section>

      {selected ? (
        <section ref={detailRef} className="admin-card admin-registrations-detail">
          <div className="admin-actions admin-reg-detail-head">
            <div className="admin-reg-detail-head__copy">
              <p className="admin-reg-detail-head__eyebrow">Registration #{selected.id}</p>
              <h3 className="heading-4 admin-reg-detail-head__title">
                {selected.applicantFullName || 'Unknown student'}
              </h3>
              <p className="admin-muted">
                {selected.courseTitle || 'No course'} · {selected.email || 'no email'}
              </p>
              <div className="admin-reg-detail-head__badges">
                <StatusBadge status={selected.status} />
                <AccessBadge accessStatus={selected.accessStatus} />
                <AccountBadge accountStatus={selected.userAccountStatus} />
              </div>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>

          {ENROLLMENT_FIELD_SECTIONS.map((section) => (
            <div key={section.id} className="admin-enrollment-section">
              <h4 className="admin-enrollment-section__title">{section.title}</h4>
              <div className="admin-form-grid admin-enrollment-section__grid">
                {section.fields.map((field) => (
                  <DetailField
                    key={field.key}
                    label={field.label}
                    value={formatEnrollmentField(field.key, selected)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="admin-enrollment-section">
            <h4 className="admin-enrollment-section__title">Admin note</h4>
            <div className="admin-field">
              <label htmlFor="admin-enrollment-note">
                Note (saved with approve / reject / suspend)
              </label>
              <textarea
                id="admin-enrollment-note"
                value={adminNoteDraft}
                onChange={(event) => setAdminNoteDraft(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Optional for approve · required (3–500 chars) for reject and suspend"
              />
              <p className="admin-field__hint">{(adminNoteDraft || '').length}/500 characters</p>
            </div>
          </div>

          {(() => {
            const approveBlocked = approveDisabledReason(selected);
            return (
              <div className="admin-row-actions admin-reg-detail-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busyId === selected.id || Boolean(approveBlocked) || selected.status === 'approved'}
                  onClick={() => approveEnrollment(selected)}
                  title={approveBlocked || 'Approve this paid registration'}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={busyId === selected.id || selected.status === 'rejected'}
                  onClick={() => openRejectConfirm(selected)}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn--course-danger btn--sm"
                  disabled={busyId === selected.id}
                  onClick={() => openSuspendConfirm(selected)}
                  title="Lock the linked student account, revoke sessions, and revoke this enrollment"
                >
                  Suspend student
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={Boolean(exportingId)}
                  onClick={() => exportSingleDetailsExcel(selected)}
                >
                  {exportingId === selected.id ? 'Excel…' : 'Detail Excel'}
                </button>
              </div>
            );
          })()}
        </section>
      ) : null}

      <AdminConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title}
        message={
          confirmDialog ? (
            <>
              <p>{confirmDialog.message}</p>
              <label htmlFor="admin-confirm-note" className="admin-confirm-dialog__note-label">
                Admin note {confirmDialog.noteRequired ? '(required, 3–500 chars)' : '(optional)'}
              </label>
              <textarea
                id="admin-confirm-note"
                className="admin-confirm-dialog__note"
                rows={3}
                maxLength={500}
                value={confirmDialog.note || ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setConfirmDialog((prev) => (prev ? { ...prev, note: value, error: '' } : prev));
                }}
              />
              {confirmDialog.error ? (
                <p className="admin-error" style={{ marginTop: '0.5rem' }}>
                  {confirmDialog.error}
                </p>
              ) : null}
            </>
          ) : null
        }
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setConfirmDialog(null);
        }}
        onConfirm={applyConfirmAction}
      />
    </section>
  );
}
