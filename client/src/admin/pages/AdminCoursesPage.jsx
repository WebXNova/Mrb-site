import { adminRoute } from '../../config/adminPaths';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import CourseDataGrid from '../components/courses/CourseDataGrid';
import AdminCourseEditView from '../components/courses/AdminCourseEditView';
import CourseCreateWizard from '../course-wizard/CourseCreateWizard.jsx';
import './AdminCoursesPage.css';
import '../styles/admin-courses-dashboard.css';

const VALID_TABS = new Set(['general', 'pricing', 'subjects', 'batch', 'health']);

export default function AdminCoursesPage() {
  const token = getAdminToken();
  const toast = useAdminToast();
  const navigate = useNavigate();
  const { id: routeCourseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeId = Number(routeCourseId);
  const editingId = Number.isFinite(routeId) && routeId > 0 ? routeId : null;
  const activeTab = VALID_TABS.has(searchParams.get('tab')) ? searchParams.get('tab') : 'general';

  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  async function loadCourses() {
    setCoursesLoading(true);
    try {
      const response = await adminApi.courses(token);
      setCourses(response?.data || []);
    } finally {
      setCoursesLoading(false);
    }
  }

  useEffect(() => {
    loadCourses().catch((err) => {
      const msg = err.message || 'Failed to load courses';
      setError(msg);
      toast.error(msg);
    });
  }, []);

  function resetForm() {
    setShowCreateWizard(false);
    setSuccess('');
    navigate(adminRoute('courses'));
  }

  function onTabChange(tab) {
    if (!editingId) return;
    setSearchParams({ tab }, { replace: true });
  }

  function onArchive(courseId) {
    setConfirmDialog({
      type: 'archive',
      courseId,
      title: 'Archive course?',
      message:
        'Hide this course from the catalog? It will be archived — lectures stay attached until you purge the course.',
    });
  }

  function onPurge(course) {
    setConfirmDialog({
      type: 'purge',
      course,
      title: 'Permanently delete course?',
      message: `Delete "${course.title}"? This removes the course, its lectures, chapters, subjects, and related catalog data. Active enrollments block deletion.`,
    });
  }

  async function runConfirmAction() {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    setError('');
    try {
      if (confirmDialog.type === 'archive') {
        await adminApi.deleteCourse(token, confirmDialog.courseId);
        await loadCourses();
        toast.success('Course archived.');
        setSuccess('Course archived.');
      } else if (confirmDialog.type === 'purge') {
        const { course } = confirmDialog;
        await adminApi.deleteCourse(token, course.id, { purge: true });
        await loadCourses();
        toast.success('Course permanently deleted.');
        setSuccess('Course permanently deleted.');
      } else if (confirmDialog.type === 'bulk-archive') {
        const ids = confirmDialog.courseIds || [];
        await Promise.all(ids.map((id) => adminApi.deleteCourse(token, id)));
        await loadCourses();
        toast.success(`${ids.length} course(s) archived.`);
        setSuccess(`${ids.length} course(s) archived.`);
      }
      setConfirmDialog(null);
    } catch (err) {
      const msg = err.message || 'Action failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setConfirmBusy(false);
    }
  }

  function onBulkArchive(courseIds) {
    if (!courseIds.length) return;
    setConfirmDialog({
      type: 'bulk-archive',
      courseIds,
      title: `Archive ${courseIds.length} course(s)?`,
      message: 'Selected courses will be hidden from the public catalog.',
    });
  }

  function onEdit(course) {
    setShowCreateWizard(false);
    navigate(adminRoute(`courses/${course.id}?tab=general`));
  }

  function openCreateWizard() {
    setShowCreateWizard(true);
    setError('');
    setSuccess('');
    window.requestAnimationFrame(() => {
      document.getElementById('course-create-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function closeCreateWizard() {
    setShowCreateWizard(false);
    setSuccess('');
  }

  return (
    <section className="admin-page admin-page--courses">
      {!editingId ? (
        <header className="admin-courses-page-header">
          <div>
            <h1 className="admin-courses-page-header__title">Course management</h1>
            <p className="admin-courses-page-header__subtitle">
              Create, publish, and manage your learning catalog with a guided workflow and real-time preview.
            </p>
          </div>
          <div className="admin-courses-page-header__actions">
            {!showCreateWizard ? (
              <button type="button" className="btn--course-primary" onClick={openCreateWizard}>
                <AddIcon fontSize="small" style={{ marginRight: 6, verticalAlign: -3 }} aria-hidden />
                New course
              </button>
            ) : (
              <button type="button" className="btn--course-secondary" onClick={resetForm}>
                Back to list
              </button>
            )}
          </div>
        </header>
      ) : null}

      {error && !editingId ? <p className="admin-error">{error}</p> : null}
      {success && !editingId ? <p className="admin-success">{success}</p> : null}

      {showCreateWizard && !editingId ? (
        <div id="course-create-wizard">
          <CourseCreateWizard
            token={token}
            onCreated={(created) => {
              setShowCreateWizard(false);
              setError('');
              setSuccess('Course saved successfully.');
              toast.success('Course saved successfully.');
              loadCourses().catch((err) => toast.error(err.message || 'Failed to load courses'));
              if (created?.id) {
                navigate(adminRoute(`courses/${created.id}?tab=general`));
              }
            }}
            onCancel={closeCreateWizard}
          />
        </div>
      ) : editingId ? (
        <AdminCourseEditView
          courseId={editingId}
          token={token}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onBack={resetForm}
          onUpdated={loadCourses}
        />
      ) : null}

      {!showCreateWizard && !editingId ? (
        <CourseDataGrid
          courses={courses}
          loading={coursesLoading}
          onEdit={onEdit}
          onArchive={onArchive}
          onPurge={onPurge}
          onBulkArchive={onBulkArchive}
        />
      ) : null}

      <AdminConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel={confirmDialog?.type === 'purge' ? 'Delete' : 'Confirm'}
        danger={confirmDialog?.type === 'purge'}
        busy={confirmBusy}
        onConfirm={runConfirmAction}
        onCancel={() => setConfirmDialog(null)}
      />
    </section>
  );
}
