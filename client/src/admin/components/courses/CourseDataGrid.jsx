import { adminRoute } from '../../../config/adminPaths';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AdminSearchField from '../AdminSearchField';
import AdminActionMenu, { AdminActionMenuItem } from '../AdminActionMenu';
import CourseStatusBadge from './CourseStatusBadge';
import CourseLevelBadge from './CourseLevelBadge';
import { resolveCourseThumbnailUrl } from '../../../utils/mediaUrl';

const PAGE_SIZE = 10;

function formatPricingCell(pricing) {
  if (!pricing) return '—';
  if (pricing.type === 'free') return 'Free';
  const amount = Number(pricing.price_amount || 0).toLocaleString('en-PK');
  const currency = pricing.currency || 'PKR';
  return `${currency} ${amount}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function SortHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <button type="button" onClick={() => onSort(sortKey)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}
      {active ? (sort.dir === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: 14 }} /> : <ArrowDownwardIcon sx={{ fontSize: 14 }} />) : null}
    </button>
  );
}

export default function CourseDataGrid({
  courses,
  loading = false,
  onEdit,
  onArchive,
  onPurge,
  onBulkArchive,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'updated_at', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());

  function toggleSort(key) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...courses];
    if (q) {
      list = list.filter(
        (c) =>
          String(c.title || '').toLowerCase().includes(q) ||
          String(c.id).includes(q)
      );
    }
    if (statusFilter === 'active') list = list.filter((c) => c.is_active);
    if (statusFilter === 'inactive') list = list.filter((c) => !c.is_active);
    if (levelFilter !== 'all') list = list.filter((c) => String(c.level).toLowerCase() === levelFilter);

    list.sort((a, b) => {
      let av = a[sort.key];
      let bv = b[sort.key];
      if (sort.key === 'title') {
        av = String(a.title || '').toLowerCase();
        bv = String(b.title || '').toLowerCase();
      }
      if (sort.key === 'pricing') {
        av = a.pricing?.type === 'free' ? 0 : Number(a.pricing?.price_amount ?? 0);
        bv = b.pricing?.type === 'free' ? 0 : Number(b.pricing?.price_amount ?? 0);
      }
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [courses, search, statusFilter, levelFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const allPageSelected = pageRows.length > 0 && pageRows.every((c) => selected.has(c.id));

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageRows.forEach((c) => next.delete(c.id));
      else pageRows.forEach((c) => next.add(c.id));
      return next;
    });
  }

  return (
    <div className="course-data-grid">
      <div className="course-data-grid__toolbar">
        <div className="course-data-grid__toolbar-grow">
          <AdminSearchField
            id="course-grid-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            onClear={() => {
              setSearch('');
              setPage(1);
            }}
            placeholder="Search courses…"
            label="Search courses"
          />
        </div>
        <select
          className="course-data-grid__filter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          className="course-data-grid__filter"
          value={levelFilter}
          onChange={(e) => {
            setLevelFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by level"
        >
          <option value="all">All levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        {selected.size > 0 ? (
          <div className="course-data-grid__bulk">
            <span>{selected.size} selected</span>
            <button
              type="button"
              className="btn--course-secondary"
              onClick={() => {
                onBulkArchive?.(Array.from(selected));
                setSelected(new Set());
              }}
            >
              Archive selected
            </button>
          </div>
        ) : null}
      </div>

      <div className="course-data-grid__table-wrap">
        <table className="course-data-grid__table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={togglePage}
                  aria-label="Select all on page"
                />
              </th>
              <th>Thumbnail</th>
              <th>
                <SortHeader label="ID" sortKey="id" sort={sort} onSort={toggleSort} />
              </th>
              <th className="course-data-grid__col-name">
                <SortHeader label="Course name" sortKey="title" sort={sort} onSort={toggleSort} />
              </th>
              <th>Instructor</th>
              <th>
                <SortHeader label="Level" sortKey="level" sort={sort} onSort={toggleSort} />
              </th>
              <th>
                <SortHeader label="Price" sortKey="pricing" sort={sort} onSort={toggleSort} />
              </th>
              <th>Students</th>
              <th>Status</th>
              <th>
                <SortHeader label="Last updated" sortKey="updated_at" sort={sort} onSort={toggleSort} />
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="course-data-grid__skeleton-row">
                    {Array.from({ length: 11 }).map((__, j) => (
                      <td key={j}>
                        <div className="course-data-grid__skeleton" style={{ width: j === 3 ? '80%' : '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {!loading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <div className="course-data-grid__empty">
                    <p className="course-data-grid__empty-title">No courses found</p>
                    <p className="course-data-grid__empty-text">
                      {search || statusFilter !== 'all' || levelFilter !== 'all'
                        ? 'Try adjusting your search or filters.'
                        : 'Create your first course using the wizard above.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}
            {!loading
              ? pageRows.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(course.id)}
                        onChange={() => toggleRow(course.id)}
                        aria-label={`Select ${course.title}`}
                      />
                    </td>
                    <td>
                      {course.thumbnail_url ? (
                        <img
                          className="course-data-grid__thumb"
                          src={resolveCourseThumbnailUrl(course.thumbnail_url)}
                          alt=""
                        />
                      ) : (
                        <span className="course-data-grid__thumb course-data-grid__thumb--empty">N/A</span>
                      )}
                    </td>
                    <td>{course.id}</td>
                    <td className="course-data-grid__name-cell">
                      <div className="course-data-grid__name" title={course.title}>
                        {course.title}
                      </div>
                      {course.short_description ? (
                        <div className="course-data-grid__sub" title={course.short_description}>
                          {course.short_description}
                        </div>
                      ) : null}
                    </td>
                    <td>—</td>
                    <td>
                      <CourseLevelBadge level={course.level} />
                    </td>
                    <td>{formatPricingCell(course.pricing)}</td>
                    <td>—</td>
                    <td>
                      <CourseStatusBadge active={course.is_active} />
                    </td>
                    <td>{formatDate(course.updated_at)}</td>
                    <td>
                      <AdminActionMenu triggerLabel="Actions" align="right" triggerClassName="btn--course-secondary">
                        <AdminActionMenuItem onClick={() => onEdit(course)}>Edit</AdminActionMenuItem>
                        <AdminActionMenuItem as={Link} to={adminRoute(`courses/${course.id}/subjects`)}>
                          Subjects
                        </AdminActionMenuItem>
                        <AdminActionMenuItem as={Link} to={adminRoute(`courses/${course.id}/batches`)}>
                          Batches
                        </AdminActionMenuItem>
                        <AdminActionMenuItem onClick={() => onArchive(course.id)}>Archive</AdminActionMenuItem>
                        <AdminActionMenuItem className="admin-action-menu__item--danger" onClick={() => onPurge(course)}>
                          Purge
                        </AdminActionMenuItem>
                      </AdminActionMenu>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 ? (
        <div className="course-data-grid__footer">
          <span>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div className="course-data-grid__pagination">
            <button
              type="button"
              className="btn--course-secondary"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn--course-secondary"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
