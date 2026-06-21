import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import '../styles/admin-reviews.css';

const DEFAULT_FILTERS = {
  status: '',
  rating: '',
  featured: '',
  published: '',
  dateFrom: '',
  dateTo: '',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const RATING_OPTIONS = [
  { value: '', label: 'All ratings' },
  { value: '5', label: '5 stars' },
  { value: '4', label: '4 stars' },
  { value: '3', label: '3 stars' },
  { value: '2', label: '2 stars' },
  { value: '1', label: '1 star' },
];

const ACTION_LABELS = {
  approve: 'Approve',
  reject: 'Reject',
  publish: 'Publish',
  archive: 'Archive',
  delete: 'Delete',
  feature: 'Feature',
  unfeature: 'Remove feature',
  submit: 'Submitted',
  edit: 'Edited',
  note_update: 'Notes updated',
};

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function StarRating({ rating, max = 5 }) {
  const n = Number(rating) || 0;
  return (
    <span className="admin-review-stars" aria-label={`${n} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? undefined : 'admin-review-stars__empty'}>
          ★
        </span>
      ))}
    </span>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || 'PENDING').toLowerCase();
  return (
    <span className={`admin-review-status admin-review-status--${normalized}`}>
      {status || 'PENDING'}
    </span>
  );
}

function ReviewFlags({ published, featured }) {
  return (
    <span className="admin-review-flags">
      {published ? <span className="admin-review-flag admin-review-flag--published">Live</span> : null}
      {featured ? <span className="admin-review-flag admin-review-flag--featured">Featured</span> : null}
    </span>
  );
}

function StatCard({ label, value, tone = 'default', active, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`admin-reviews-stat ${tone !== 'default' ? `admin-reviews-stat--${tone}` : ''} ${
        onClick ? 'admin-reviews-stat--clickable' : ''
      } ${active ? 'admin-reviews-stat--active' : ''}`}
      onClick={onClick}
    >
      <span className="admin-reviews-stat__value">{value}</span>
      <span className="admin-reviews-stat__label">{label}</span>
    </Tag>
  );
}

function ReviewDetailModal({
  open,
  review,
  busyAction,
  notesDraft,
  onNotesChange,
  onSaveNotes,
  onClose,
  onAction,
}) {
  if (!open || !review) return null;

  return (
    <div
      className="admin-review-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      onClick={onClose}
    >
      <div className="admin-review-modal__panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-review-modal__header">
          <div>
            <h2 id="review-modal-title" className="heading-3">
              Review #{review.id}
            </h2>
            <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={review.status} />
              <StarRating rating={review.rating} />
              <ReviewFlags published={review.published} featured={review.featured} />
            </div>
          </div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="admin-review-modal__grid">
          <div className="admin-review-modal__field">
            <label>Full name</label>
            <p>{review.name}</p>
          </div>
          <div className="admin-review-modal__field">
            <label>Phone</label>
            <p>{review.phone}</p>
          </div>
          <div className="admin-review-modal__field">
            <label>Email</label>
            <p>{review.email || '—'}</p>
          </div>
          <div className="admin-review-modal__field">
            <label>Course</label>
            <p>{review.courseName || '—'}</p>
          </div>
          <div className="admin-review-modal__field">
            <label>Submitted</label>
            <p>{formatDate(review.createdAt)}</p>
          </div>
          <div className="admin-review-modal__field">
            <label>Published</label>
            <p>{review.published ? formatDate(review.publishedAt) : 'Not published'}</p>
          </div>
        </div>

        <div className="admin-review-modal__field">
          <label>Review message</label>
          <div className="admin-review-modal__message">{review.reviewMessage}</div>
        </div>

        <div className="admin-review-modal__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={busyAction || review.status === 'APPROVED'}
            onClick={() => onAction('approve', review.id)}
          >
            Approve
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={busyAction || review.status !== 'APPROVED' || review.published}
            onClick={() => onAction('publish', review.id)}
          >
            Publish
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={busyAction || !review.published || review.status !== 'APPROVED'}
            onClick={() => onAction(review.featured ? 'unfeature' : 'feature', review.id)}
          >
            {review.featured ? '★ Unfeature' : '⭐ Feature'}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={busyAction || review.status === 'REJECTED'}
            onClick={() => onAction('reject', review.id)}
          >
            Reject
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={busyAction || review.status === 'ARCHIVED'}
            onClick={() => onAction('archive', review.id)}
          >
            Archive
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={busyAction}
            onClick={() => onAction('delete', review.id)}
            style={{ color: '#991b1b' }}
          >
            Delete
          </button>
        </div>

        <div className="admin-review-notes">
          <label htmlFor="review-admin-notes" className="admin-review-audit__title">
            Admin notes
          </label>
          <textarea
            id="review-admin-notes"
            value={notesDraft}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Internal notes visible only to admins…"
          />
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{ marginTop: '0.5rem' }}
            disabled={busyAction}
            onClick={onSaveNotes}
          >
            Save notes
          </button>
        </div>

        <div className="admin-review-audit">
          <h3 className="admin-review-audit__title">Status history</h3>
          <div className="admin-review-audit__list">
            {(review.auditLog || []).length ? (
              review.auditLog.map((entry) => (
                <div key={entry.id} className="admin-review-audit__item">
                  <div className="admin-review-audit__item-head">
                    <span>{ACTION_LABELS[entry.action] || entry.action}</span>
                    <span className="admin-review-audit__item-meta">{formatDate(entry.createdAt)}</span>
                  </div>
                  <div className="admin-review-audit__item-meta">
                    By {entry.adminName || 'System'}
                    {entry.previousStatus || entry.newStatus
                      ? ` · ${entry.previousStatus || '—'} → ${entry.newStatus || '—'}`
                      : ''}
                  </div>
                  {entry.note ? <div style={{ marginTop: '0.35rem' }}>{entry.note}</div> : null}
                </div>
              ))
            ) : (
              <p className="body-sm" style={{ color: '#6b7280' }}>
                No audit entries yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminReviewsPage() {
  const token = getAdminToken();
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [modalReview, setModalReview] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [confirm, setConfirm] = useState(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const query = useMemo(() => {
    const q = { page: pagination.page, limit: pagination.limit };
    if (searchDebounced) q.search = searchDebounced;
    if (filters.status) q.status = filters.status;
    if (filters.rating) q.rating = filters.rating;
    if (filters.featured) q.featured = filters.featured;
    if (filters.published) q.published = filters.published;
    if (filters.dateFrom) q.dateFrom = filters.dateFrom;
    if (filters.dateTo) q.dateTo = filters.dateTo;
    return q;
  }, [pagination.page, pagination.limit, searchDebounced, filters]);

  const loadStats = useCallback(async () => {
    try {
      const res = await adminApi.reviewStats(token);
      setStats(res?.data || null);
    } catch {
      /* non-blocking */
    }
  }, [token]);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.reviews(token, query);
      const data = res?.data || {};
      setItems(data.items || []);
      setPagination((prev) => ({
        ...prev,
        total: data.total ?? 0,
        totalPages: data.totalPages ?? 0,
      }));
      setSelectedIds([]);
    } catch (err) {
      setError(err.message || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [token, query]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  function patchItemInList(updated) {
    if (!updated?.id) return;
    setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    setModalReview((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
  }

  function removeItemFromList(id) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    if (modalReview?.id === id) setModalReview(null);
  }

  function showFeedback(message) {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 3500);
  }

  async function openDetail(reviewId) {
    setBusyAction('detail');
    try {
      const res = await adminApi.reviewDetail(token, reviewId);
      const detail = res?.data;
      setModalReview(detail);
      setNotesDraft(detail?.adminNotes || '');
    } catch (err) {
      setError(err.message || 'Failed to load review');
    } finally {
      setBusyAction('');
    }
  }

  async function runAction(action, reviewId, { skipConfirm = false } = {}) {
    const destructive = action === 'delete' || action === 'reject';
    if (!skipConfirm && destructive) {
      setConfirm({ action, reviewId, bulk: false });
      return;
    }

    setBusyAction(`${action}-${reviewId}`);
    const prevItems = items;
    const prevModal = modalReview;

    if (action === 'approve') {
      setItems((list) =>
        list.map((r) => (r.id === reviewId ? { ...r, status: 'APPROVED' } : r))
      );
    } else if (action === 'reject') {
      setItems((list) =>
        list.map((r) =>
          r.id === reviewId ? { ...r, status: 'REJECTED', published: false, featured: false } : r
        )
      );
    } else if (action === 'publish') {
      setItems((list) =>
        list.map((r) => (r.id === reviewId ? { ...r, published: true } : r))
      );
    } else if (action === 'feature') {
      setItems((list) => list.map((r) => (r.id === reviewId ? { ...r, featured: true } : r)));
    } else if (action === 'unfeature') {
      setItems((list) => list.map((r) => (r.id === reviewId ? { ...r, featured: false } : r)));
    } else if (action === 'archive') {
      setItems((list) =>
        list.map((r) =>
          r.id === reviewId ? { ...r, status: 'ARCHIVED', published: false, featured: false } : r
        )
      );
    } else if (action === 'delete') {
      removeItemFromList(reviewId);
    }

    try {
      let res;
      switch (action) {
        case 'approve':
          res = await adminApi.approveReview(token, reviewId);
          break;
        case 'reject':
          res = await adminApi.rejectReview(token, reviewId);
          break;
        case 'publish':
          res = await adminApi.publishReview(token, reviewId);
          break;
        case 'feature':
          res = await adminApi.featureReview(token, reviewId, true);
          break;
        case 'unfeature':
          res = await adminApi.featureReview(token, reviewId, false);
          break;
        case 'archive':
          res = await adminApi.archiveReview(token, reviewId);
          break;
        case 'delete':
          await adminApi.deleteReview(token, reviewId);
          toast.success('Review deleted');
          await loadStats();
          return;
        default:
          return;
      }

      const updated = res?.data;
      if (updated) {
        patchItemInList(updated);
        if (modalReview?.id === reviewId) {
          setModalReview(updated);
        }
      }
      showFeedback(`${ACTION_LABELS[action] || action} successful`);
      await loadStats();
    } catch (err) {
      setItems(prevItems);
      setModalReview(prevModal);
      setError(err.message || 'Action failed');
    } finally {
      setBusyAction('');
    }
  }

  async function saveNotes() {
    if (!modalReview?.id) return;
    setBusyAction('notes');
    try {
      const res = await adminApi.updateReviewNotes(token, modalReview.id, {
        adminNotes: notesDraft.trim() || null,
      });
      const updated = res?.data;
      patchItemInList(updated);
      setModalReview(updated);
      toast.success('Notes saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save notes');
    } finally {
      setBusyAction('');
    }
  }

  async function runBulkAction(action) {
    if (!selectedIds.length) return;
    const destructive = action === 'delete';
    if (destructive) {
      setConfirm({ action, bulk: true, ids: selectedIds });
      return;
    }
    setBusyAction(`bulk-${action}`);
    try {
      await adminApi.bulkReviewAction(token, { ids: selectedIds, action });
      showFeedback(`Bulk ${action} completed`);
      await loadReviews();
      await loadStats();
    } catch (err) {
      setError(err.message || 'Bulk action failed');
    } finally {
      setBusyAction('');
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    const { action, reviewId, bulk, ids } = confirm;
    setConfirm(null);
    if (bulk) {
      setBusyAction(`bulk-${action}`);
      try {
        await adminApi.bulkReviewAction(token, { ids, action });
        showFeedback(`Bulk ${action} completed`);
        await loadReviews();
        await loadStats();
      } catch (err) {
        setError(err.message || 'Bulk action failed');
      } finally {
        setBusyAction('');
      }
      return;
    }
    await runAction(action, reviewId, { skipConfirm: true });
  }

  function toggleSelectAll(checked) {
    setSelectedIds(checked ? items.map((r) => r.id) : []);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function applyStatFilter(key) {
    setPagination((p) => ({ ...p, page: 1 }));
    if (key === 'total') {
      setFilters(DEFAULT_FILTERS);
      return;
    }
    if (key === 'pending') setFilters({ ...DEFAULT_FILTERS, status: 'PENDING' });
    if (key === 'approved') setFilters({ ...DEFAULT_FILTERS, status: 'APPROVED' });
    if (key === 'rejected') setFilters({ ...DEFAULT_FILTERS, status: 'REJECTED' });
    if (key === 'published') setFilters({ ...DEFAULT_FILTERS, published: 'true' });
    if (key === 'featured') setFilters({ ...DEFAULT_FILTERS, featured: 'true' });
  }

  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <section className="admin-page admin-reviews-page">
      <section className="admin-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="heading-3">Student Reviews</h2>
            <p className="body-sm" style={{ marginTop: '0.35rem', color: '#6b7280' }}>
              Moderate testimonials submitted by students. Approve first, then publish to show on the website.
            </p>
          </div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => { loadReviews(); loadStats(); }} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="admin-reviews-stats" style={{ marginTop: '1.25rem' }}>
          <StatCard label="Total" value={stats?.total ?? '—'} onClick={() => applyStatFilter('total')} active={!filters.status && !filters.featured && !filters.published} />
          <StatCard label="Pending" value={stats?.pending ?? '—'} tone="warning" onClick={() => applyStatFilter('pending')} active={filters.status === 'PENDING'} />
          <StatCard label="Approved" value={stats?.approved ?? '—'} tone="success" onClick={() => applyStatFilter('approved')} active={filters.status === 'APPROVED'} />
          <StatCard label="Rejected" value={stats?.rejected ?? '—'} tone="danger" onClick={() => applyStatFilter('rejected')} active={filters.status === 'REJECTED'} />
          <StatCard label="Published" value={stats?.published ?? '—'} tone="primary" onClick={() => applyStatFilter('published')} active={filters.published === 'true'} />
          <StatCard label="Featured" value={stats?.featured ?? '—'} tone="gold" onClick={() => applyStatFilter('featured')} active={filters.featured === 'true'} />
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-reviews-toolbar">
          <div className="admin-reviews-toolbar__search admin-field">
            <label htmlFor="review-search">Search</label>
            <input
              id="review-search"
              type="search"
              placeholder="Name, phone, or email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
            />
          </div>
          <div className="admin-reviews-filters">
            <div className="admin-field">
              <label htmlFor="filter-status">Status</label>
              <select
                id="filter-status"
                value={filters.status}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, status: e.target.value }));
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="filter-rating">Rating</label>
              <select
                id="filter-rating"
                value={filters.rating}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, rating: e.target.value }));
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                {RATING_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="filter-featured">Featured</label>
              <select
                id="filter-featured"
                value={filters.featured}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, featured: e.target.value }));
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="">Any</option>
                <option value="true">Featured only</option>
                <option value="false">Not featured</option>
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="filter-published">Published</label>
              <select
                id="filter-published"
                value={filters.published}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, published: e.target.value }));
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="">Any</option>
                <option value="true">Published only</option>
                <option value="false">Not published</option>
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="filter-from">From</label>
              <input
                id="filter-from"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, dateFrom: e.target.value }));
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="filter-to">To</label>
              <input
                id="filter-to"
                type="date"
                value={filters.dateTo}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, dateTo: e.target.value }));
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>
          </div>
        </div>

        {selectedIds.length ? (
          <div className="admin-reviews-bulk-bar" style={{ marginTop: '1rem' }}>
            <span className="admin-reviews-bulk-bar__count">{selectedIds.length} selected</span>
            <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busyAction)} onClick={() => runBulkAction('approve')}>Approve</button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={Boolean(busyAction)} onClick={() => runBulkAction('publish')}>Publish</button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={Boolean(busyAction)} onClick={() => runBulkAction('reject')}>Reject</button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={Boolean(busyAction)} onClick={() => runBulkAction('archive')}>Archive</button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={Boolean(busyAction)} onClick={() => runBulkAction('delete')} style={{ color: '#991b1b' }}>Delete</button>
          </div>
        ) : null}

        {feedback ? (
          <p className="body-sm" style={{ marginTop: '0.75rem', color: '#166534', fontWeight: 600 }}>
            {feedback}
          </p>
        ) : null}

        {error ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{error}</p> : null}

        <div className="admin-table-wrap admin-reviews-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '2.5rem' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all reviews"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((review) => (
                  <tr key={review.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select review ${review.id}`}
                        checked={selectedIds.includes(review.id)}
                        onChange={() => toggleSelect(review.id)}
                      />
                    </td>
                    <td>#{review.id}</td>
                    <td>
                      <div>{review.name}</div>
                      <ReviewFlags published={review.published} featured={review.featured} />
                    </td>
                    <td>{review.phone}</td>
                    <td>{review.email || '—'}</td>
                    <td><StarRating rating={review.rating} /></td>
                    <td><StatusBadge status={review.status} /></td>
                    <td>{formatDate(review.createdAt)}</td>
                    <td>
                      <div className="admin-reviews-table-actions">
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => openDetail(review.id)}>View</button>
                        {review.status !== 'APPROVED' ? (
                          <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busyAction)} onClick={() => runAction('approve', review.id)}>Approve</button>
                        ) : null}
                        {review.status === 'APPROVED' && !review.published ? (
                          <button type="button" className="btn btn--secondary btn--sm" disabled={Boolean(busyAction)} onClick={() => runAction('publish', review.id)}>Publish</button>
                        ) : null}
                        {review.published && review.status === 'APPROVED' ? (
                          <button type="button" className="btn btn--secondary btn--sm" disabled={Boolean(busyAction)} onClick={() => runAction(review.featured ? 'unfeature' : 'feature', review.id)}>
                            {review.featured ? 'Unfeature' : 'Feature'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9}>{loading ? 'Loading reviews…' : 'No reviews found.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-reviews-mobile-list" style={{ marginTop: '1rem' }}>
          {items.map((review) => (
            <article key={review.id} className="admin-reviews-mobile-card">
              <div className="admin-reviews-mobile-card__head">
                <div>
                  <strong>{review.name}</strong>
                  <div style={{ marginTop: '0.25rem' }}>
                    <StatusBadge status={review.status} />
                  </div>
                </div>
                <input
                  type="checkbox"
                  aria-label={`Select review ${review.id}`}
                  checked={selectedIds.includes(review.id)}
                  onChange={() => toggleSelect(review.id)}
                />
              </div>
              <div className="admin-reviews-mobile-card__meta">
                #{review.id} · {review.phone} · {formatDate(review.createdAt)}
              </div>
              <StarRating rating={review.rating} />
              <ReviewFlags published={review.published} featured={review.featured} />
              <div className="admin-reviews-table-actions" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => openDetail(review.id)}>View</button>
                {review.status !== 'APPROVED' ? (
                  <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busyAction)} onClick={() => runAction('approve', review.id)}>Approve</button>
                ) : null}
                {review.status === 'APPROVED' && !review.published ? (
                  <button type="button" className="btn btn--secondary btn--sm" disabled={Boolean(busyAction)} onClick={() => runAction('publish', review.id)}>Publish</button>
                ) : null}
              </div>
            </article>
          ))}
          {!items.length && !loading ? (
            <p className="body-sm" style={{ color: '#6b7280' }}>No reviews found.</p>
          ) : null}
        </div>

        <div className="admin-reviews-pagination">
          <span className="admin-reviews-pagination__info">
            {pagination.total
              ? `Showing page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)`
              : 'No results'}
          </span>
          <div className="admin-reviews-pagination__controls">
            <select
              value={pagination.limit}
              onChange={(e) => setPagination((p) => ({ ...p, limit: Number(e.target.value), page: 1 }))}
              aria-label="Reviews per page"
            >
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <ReviewDetailModal
        open={Boolean(modalReview)}
        review={modalReview}
        busyAction={busyAction}
        notesDraft={notesDraft}
        onNotesChange={setNotesDraft}
        onSaveNotes={saveNotes}
        onClose={() => setModalReview(null)}
        onAction={runAction}
      />

      <AdminConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.bulk ? `Bulk ${confirm?.action}?` : `${ACTION_LABELS[confirm?.action] || 'Confirm'}?`}
        message={
          confirm?.bulk
            ? `Apply "${confirm?.action}" to ${confirm?.ids?.length || 0} selected reviews? This cannot be undone for deletions.`
            : 'This action may permanently affect the review. Continue?'
        }
        confirmLabel={confirm?.action === 'delete' ? 'Delete' : 'Confirm'}
        danger={confirm?.action === 'delete' || confirm?.action === 'reject'}
        busy={Boolean(busyAction)}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
