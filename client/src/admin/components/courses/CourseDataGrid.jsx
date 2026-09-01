import { adminRoute } from '../../../config/adminPaths';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AdminSearchField from '../AdminSearchField';
import AdminActionMenu, { AdminActionMenuItem } from '../AdminActionMenu';
import CourseControlBadges from './CourseControlBadges';
import CourseLevelBadge from './CourseLevelBadge';
import CourseCategoryTags from './CourseCategoryTags';
import AdmissionStaleWarning from './AdmissionStaleWarning';
import { resolveCourseThumbnailUrl } from '../../../utils/mediaUrl';

const PAGE_SIZE = 10;

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

const LEVEL_FILTERS = [
  { key: 'all', label: 'All levels' },
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
];

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
  categoryOptions = [],
  loading = false,
  onEdit,
  onArchive,
  onActivate,
  onPurge,
  onBulkArchive,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() => new Set());
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
    if (selectedCategoryIds.size > 0) {
      list = list.filter((c) => {
        const ids = (c.categories || c.category_ids || []).map((item) =>
          typeof item === 'object' ? Number(item.id) : Number(item)
        );
        return [...selectedCategoryIds].some((catId) => ids.includes(Number(catId)));
      });
    }

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
  }, [courses, search, statusFilter, levelFilter, selectedCategoryIds, sort]);

  function toggleCategoryFilter(categoryId) {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      const id = Number(categoryId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(1);
  }

  const filterCategories = useMemo(() => {
    const fromOptions = categoryOptions.filter((c) => c.isActive);
    if (fromOptions.length) return fromOptions;
    const map = new Map();
    for (const course of courses) {
      for (const cat of course.categories || []) {
        if (cat?.isActive !== false) map.set(Number(cat.id), cat);
      }
    }
    return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [categoryOptions, courses]);

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
    <div className="courses-data-grid">
      <div className="courses-filters">
        <div className="courses-filters__row courses-filters__row--toolbar">
          <div className="courses-filters__block courses-filters__block--search courses-filters__search">
            <p className="courses-filters__label">Search</p>
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

          <div className="courses-filters__block courses-filters__block--status">
            <p className="courses-filters__label">Status</p>
            <div className="courses-filters__status-chips" role="tablist" aria-label="Filter by status">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === filter.key}
                  className={`courses-status-chip ${statusFilter === filter.key ? 'courses-status-chip--active' : ''}`}
                  onClick={() => {
                    setStatusFilter(filter.key);
                    setPage(1);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="courses-filters__block courses-filters__block--level">
            <p className="courses-filters__label">Level</p>
            <div className="courses-filters__status-chips" role="tablist" aria-label="Filter by level">
              {LEVEL_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  role="tab"
                  aria-selected={levelFilter === filter.key}
                  className={`courses-status-chip ${levelFilter === filter.key ? 'courses-status-chip--active' : ''}`}
                  onClick={() => {
                    setLevelFilter(filter.key);
                    setPage(1);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {filterCategories.length > 0 ? (
            <div className="courses-filters__block courses-filters__block--categories">
              <p className="courses-filters__label">Categories</p>
              <div className="courses-filters__status-chips" role="group" aria-label="Filter by category">
                {filterCategories.map((cat) => {
                  const selected = selectedCategoryIds.has(Number(cat.id));
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`courses-status-chip${selected ? ' courses-status-chip--active' : ''}`}
                      aria-pressed={selected}
                      onClick={() => toggleCategoryFilter(cat.id)}
                    >
                      {cat.name}
                    </button>
                  );
                })}
                {selectedCategoryIds.size > 0 ? (
                  <button
                    type="button"
                    className="courses-status-chip courses-status-chip--clear"
                    onClick={() => {
                      setSelectedCategoryIds(new Set());
                      setPage(1);
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {selected.size > 0 ? (
          <div className="courses-filters__bulk">
            <span>{selected.size} selected</span>
            <button
              type="button"
              className="courses-page__btn courses-page__btn--secondary"
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

      <div className="courses-table-shell">
          <table className="courses-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePage}
                    aria-label="Select all on page"
                  />
                </th>
                <th className="col-thumb">Thumbnail</th>
                <th className="col-id">
                  <SortHeader label="ID" sortKey="id" sort={sort} onSort={toggleSort} />
                </th>
                <th className="col-name">
                  <SortHeader label="Course name" sortKey="title" sort={sort} onSort={toggleSort} />
                </th>
                <th className="col-instructor">Instructor</th>
                <th className="col-level">
                  <SortHeader label="Level" sortKey="level" sort={sort} onSort={toggleSort} />
                </th>
                <th className="col-categories">Categories</th>
                <th className="col-price">
                  <SortHeader label="Price" sortKey="pricing" sort={sort} onSort={toggleSort} />
                </th>
                <th className="col-students">Students</th>
                <th className="col-status">Status</th>
                <th className="col-updated">
                  <SortHeader label="Last updated" sortKey="updated_at" sort={sort} onSort={toggleSort} />
                </th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      {Array.from({ length: 12 }).map((__, j) => (
                        <td key={j}>
                          <div className="courses-table__skeleton" style={{ width: j === 3 ? '80%' : '60%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {!loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={12}>
                    <div className="courses-table-empty">
                      <p className="courses-table-empty__title">No courses found</p>
                      <p className="courses-table-empty__text">
                        {search || statusFilter !== 'all' || levelFilter !== 'all' || selectedCategoryIds.size > 0
                          ? 'Try adjusting your search or filters.'
                          : 'Create your first course using New course above.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {!loading
                ? pageRows.map((course) => (
                    <tr key={course.id}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          checked={selected.has(course.id)}
                          onChange={() => toggleRow(course.id)}
                          aria-label={`Select ${course.title}`}
                        />
                      </td>
                      <td className="col-thumb">
                        {course.thumbnail_url ? (
                          <img
                            className="courses-table__thumb"
                            src={resolveCourseThumbnailUrl(course.thumbnail_url)}
                            alt=""
                          />
                        ) : (
                          <span className="courses-table__thumb courses-table__thumb--empty">N/A</span>
                        )}
                      </td>
                      <td className="col-id">{course.id}</td>
                      <td className="col-name">
                        <span className="courses-table__name" title={course.title}>
                          {course.title}
                        </span>
                        {course.admission_stale ? (
                          <AdmissionStaleWarning endDate={course.end_date} variant="inline" />
                        ) : null}
                        {course.short_description ? (
                          <span className="courses-table__sub" title={course.short_description}>
                            {course.short_description}
                          </span>
                        ) : null}
                      </td>
                      <td className="col-instructor">—</td>
                      <td className="col-level">
                        <CourseLevelBadge level={course.level} />
                      </td>
                      <td className="col-categories">
                        <CourseCategoryTags categories={course.categories || []} />
                      </td>
                      <td className="col-price">{formatPricingCell(course.pricing)}</td>
                      <td className="col-students">—</td>
                      <td className="col-status">
                        <CourseControlBadges course={course} compact />
                      </td>
                      <td className="col-updated">{formatDate(course.updated_at)}</td>
                      <td className="col-actions">
                        <div className="courses-row-actions">
                          <button type="button" className="courses-row-actions__primary" onClick={() => onEdit(course)}>
                            Edit
                          </button>
                          <AdminActionMenu triggerLabel="More" align="right" triggerClassName="courses-row-actions__more">
                            <AdminActionMenuItem as={Link} to={adminRoute(`courses/${course.id}/subjects`)}>
                              Subjects
                            </AdminActionMenuItem>
                            <AdminActionMenuItem as={Link} to={adminRoute(`courses/${course.id}/batches`)}>
                              Batches
                            </AdminActionMenuItem>
                            <AdminActionMenuItem onClick={() => onActivate(course.id)}>Activate</AdminActionMenuItem>
                            <AdminActionMenuItem onClick={() => onArchive(course.id)}>Archive</AdminActionMenuItem>
                            <AdminActionMenuItem className="admin-action-menu__item--danger" onClick={() => onPurge(course)}>
                              Purge
                            </AdminActionMenuItem>
                          </AdminActionMenu>
                        </div>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
      </div>

      {!loading && filtered.length > 0 ? (
        <div className="courses-table-footer">
          <span>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div className="courses-table-footer__pagination">
            <button
              type="button"
              className="courses-page__btn courses-page__btn--secondary"
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
              className="courses-page__btn courses-page__btn--secondary"
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
