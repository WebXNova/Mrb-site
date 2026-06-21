import { adminRoute } from '../../config/adminPaths';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminSearchField from '../components/AdminSearchField';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminTeacherMobileCard from '../components/teachers/AdminTeacherMobileCard';
import TeacherRowActions from '../components/teachers/TeacherRowActions';
import TeacherStatusBadge from '../components/teachers/TeacherStatusBadge';
import TeacherSubjectChips from '../components/teachers/TeacherSubjectChips';
import { useAdminToast } from '../context/AdminToastContext';
import {
  TEACHER_STATUS_FILTERS,
  buildTeacherSubjectFilterOptions,
  countTeachersByStatus,
  filterTeachersList,
} from '../utils/teacherListFilters';
import '../styles/admin-courses-dashboard.css';
import '../styles/admin-teachers.css';

const PAGE_SIZE = 10;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function mapTeacherRow(teacher) {
  return {
    id: teacher.id,
    fullName: teacher.fullName,
    email: teacher.email,
    username: teacher.username,
    status: teacher.status,
    createdAt: teacher.createdAt,
    assignedSubjectTitles: teacher.assignedSubjectTitles || [],
  };
}

export default function AdminTeachersPage() {
  const token = getAdminToken();
  const toast = useAdminToast();
  const [teachers, setTeachers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [busyTeacherId, setBusyTeacherId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const filteredTeachers = useMemo(
    () =>
      filterTeachersList(teachers, {
        search: debouncedSearch,
        statusFilter,
        subjectFilter,
      }),
    [teachers, debouncedSearch, statusFilter, subjectFilter]
  );

  const subjectFilterOptions = useMemo(() => buildTeacherSubjectFilterOptions(teachers), [teachers]);

  const { active: activeCount, inactive: inactiveCount } = useMemo(
    () => countTeachersByStatus(teachers),
    [teachers]
  );

  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const paginatedTeachers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTeachers.slice(start, start + PAGE_SIZE);
  }, [filteredTeachers, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, subjectFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function loadTeachers() {
    const response = await adminApi.teachers(token);
    const rows = Array.isArray(response?.data) ? response.data : [];
    setTeachers(rows.map(mapTeacherRow));
  }

  useEffect(() => {
    setIsLoading(true);
    setLoadError('');
    loadTeachers()
      .catch((err) => setLoadError(err.message || 'Failed to load teachers.'))
      .finally(() => setIsLoading(false));
  }, [token]);

  function resetFilters() {
    setSearchQuery('');
    setStatusFilter('all');
    setSubjectFilter('all');
  }

  async function applyStatusChange(teacher, nextStatus, { confirmDeactivate = false } = {}) {
    setBusyTeacherId(teacher.id);
    setConfirmBusy(true);
    try {
      await adminApi.updateTeacherStatus(token, teacher.id, {
        status: nextStatus,
        confirmDeactivate,
      });
      toast.success(
        nextStatus === 'active'
          ? `${teacher.fullName || 'Teacher'} is now active.`
          : `${teacher.fullName || 'Teacher'} has been deactivated.`
      );
      await loadTeachers();
      setConfirmDialog(null);
    } catch (err) {
      toast.error(err.message || 'Could not update teacher status.');
    } finally {
      setBusyTeacherId(null);
      setConfirmBusy(false);
    }
  }

  function requestActivate(teacher) {
    applyStatusChange(teacher, 'active');
  }

  function requestDeactivate(teacher) {
    setConfirmDialog({
      teacher,
      title: 'Deactivate teacher',
      message:
        'Are you sure you want to deactivate this teacher? They will no longer be able to log in or receive new student questions.',
      confirmLabel: 'Deactivate',
      danger: true,
    });
  }

  const showEmpty = !isLoading && !loadError && teachers.length === 0;
  const showFilteredEmpty = !isLoading && !loadError && teachers.length > 0 && filteredTeachers.length === 0;

  return (
    <section className="admin-page admin-page--teachers">
      <header className="admin-courses-page-header">
        <div>
          <h1 className="admin-courses-page-header__title">Teacher management</h1>
          <p className="admin-courses-page-header__subtitle">
            Manage teachers, subject assignments, and account status.
          </p>
        </div>
        <div className="admin-courses-page-header__actions">
          <Link className="btn--course-primary admin-touch-target" to={adminRoute('teachers/create')}>
            <AddIcon fontSize="small" style={{ marginRight: 6, verticalAlign: -3 }} aria-hidden />
            Create teacher
          </Link>
        </div>
      </header>

      <section className="admin-grid" aria-busy={isLoading}>
        {isLoading ? (
          <>
            <div className="admin-skeleton admin-skeleton-card" />
            <div className="admin-skeleton admin-skeleton-card" />
            <div className="admin-skeleton admin-skeleton-card" />
          </>
        ) : (
          <>
            <article className="admin-stat-card">
              <p className="admin-stat-card__label">Total teachers</p>
              <p className="admin-stat-card__value">{teachers.length}</p>
            </article>
            <article className="admin-stat-card">
              <p className="admin-stat-card__label">Active</p>
              <p className="admin-stat-card__value">{activeCount}</p>
            </article>
            <article className="admin-stat-card">
              <p className="admin-stat-card__label">Inactive</p>
              <p className="admin-stat-card__value">{inactiveCount}</p>
            </article>
          </>
        )}
      </section>

      <section className="admin-card">
        <div className="admin-tests-list-head">
          <h2 className="heading-3">All teachers</h2>
        </div>

        <div className="admin-teachers-toolbar">
          <AdminSearchField
            id="teachers-search"
            label="Search teachers"
            placeholder="Search by name, email, or username…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />

          <div className="admin-teachers-toolbar__filters">
            <div className="admin-status-filters" role="tablist" aria-label="Filter teachers by status">
              {TEACHER_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === filter.key}
                  className={`admin-tag-chip ${statusFilter === filter.key ? 'admin-tag-chip--active' : ''}`}
                  onClick={() => setStatusFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="admin-teachers-subject-filter">
              <label className="admin-teachers-subject-filter__label" htmlFor="teachers-subject-filter">
                Subject
              </label>
              <select
                id="teachers-subject-filter"
                className="admin-teachers-subject-filter__select"
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
              >
                {subjectFilterOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button type="button" className="btn btn--secondary admin-touch-target" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">Could not load teachers</p>
            <p className="admin-empty-state__text">{loadError}</p>
            <button type="button" className="btn btn--primary admin-touch-target" onClick={() => loadTeachers()}>
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div aria-hidden>
            <div className="admin-skeleton admin-skeleton-row" />
            <div className="admin-skeleton admin-skeleton-row" />
            <div className="admin-skeleton admin-skeleton-row" />
          </div>
        ) : showFilteredEmpty ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">No teachers match your filters</p>
            <p className="admin-empty-state__text">Try a different search or reset filters.</p>
            <button type="button" className="btn btn--secondary admin-touch-target" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        ) : showEmpty ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">No teachers found</p>
            <p className="admin-empty-state__text">
              Create your first teacher to start managing student questions.
            </p>
            <Link className="btn btn--primary admin-touch-target" to={adminRoute('teachers/create')}>
              Create teacher
            </Link>
          </div>
        ) : (
          <>
            <div className="admin-teachers-table-wrap">
              <table className="admin-teachers-table">
                <thead>
                  <tr>
                    <th scope="col">Teacher name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Username</th>
                    <th scope="col">Assigned subjects</th>
                    <th scope="col">Status</th>
                    <th scope="col">Created date</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTeachers.map((teacher) => (
                    <tr key={teacher.id}>
                      <td>{teacher.fullName || '—'}</td>
                      <td>{teacher.email || '—'}</td>
                      <td>{teacher.username || '—'}</td>
                      <td>
                        <TeacherSubjectChips subjects={teacher.assignedSubjectTitles} />
                      </td>
                      <td>
                        <TeacherStatusBadge status={teacher.status} />
                      </td>
                      <td>{formatDate(teacher.createdAt)}</td>
                      <td>
                        <TeacherRowActions
                          teacher={teacher}
                          onActivate={requestActivate}
                          onDeactivate={requestDeactivate}
                          busy={busyTeacherId === teacher.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-teachers-mobile-list">
              {paginatedTeachers.map((teacher) => (
                <AdminTeacherMobileCard
                  key={teacher.id}
                  teacher={teacher}
                  onActivate={requestActivate}
                  onDeactivate={requestDeactivate}
                  busy={busyTeacherId === teacher.id}
                />
              ))}
            </div>

            {filteredTeachers.length > PAGE_SIZE ? (
              <nav className="admin-pagination" aria-label="Teachers pagination">
                <p className="admin-pagination__info">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, filteredTeachers.length)} of {filteredTeachers.length}
                </p>
                <div className="admin-pagination__controls">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm admin-touch-target"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm admin-touch-target"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </nav>
            ) : null}
          </>
        )}
      </section>

      <AdminConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setConfirmDialog(null);
        }}
        onConfirm={() => {
          if (!confirmDialog?.teacher) return;
          applyStatusChange(confirmDialog.teacher, 'inactive', { confirmDeactivate: true });
        }}
      />
    </section>
  );
}
