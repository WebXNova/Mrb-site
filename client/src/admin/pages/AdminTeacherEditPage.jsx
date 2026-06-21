import { adminRoute } from '../../config/adminPaths';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import TeacherForm from '../components/teachers/TeacherForm';
import TeacherFormSkeleton from '../components/teachers/TeacherFormSkeleton';
import useUnsavedChangesGuard from '../hooks/useUnsavedChangesGuard';
import { useUniqueTeacherSubjects, validateSelectedSubjectIds } from '../hooks/useUniqueTeacherSubjects';
import { useAdminToast } from '../context/AdminToastContext';
import {
  buildUpdateTeacherPayload,
  hasTeacherFormChanges,
  normalizeTeacherFormSnapshot,
} from '../utils/teacherEditDiff';
import { mapTeacherApiError, validateTeacherForm } from '../utils/teacherFormValidation';
import '../styles/admin-courses-dashboard.css';
import '../styles/admin-teachers.css';

export default function AdminTeacherEditPage() {
  const { teacherId } = useParams();
  const token = getAdminToken();
  const navigate = useNavigate();
  const toast = useAdminToast();
  const initialStatusRef = useRef('active');
  const originalFormRef = useRef(null);
  const pendingSubmitRef = useRef(false);

  const [form, setForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const { subjects, isLoading: subjectsLoading, error: subjectsLoadError } = useUniqueTeacherSubjects(token);

  const parsedId = useMemo(() => {
    const id = Number(teacherId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [teacherId]);

  const isDirty = useMemo(
    () => hasTeacherFormChanges(form, originalFormRef.current),
    [form]
  );

  const { isNavigationBlocked, confirmNavigation, cancelNavigation } = useUnsavedChangesGuard(isDirty, {
      enabled: Boolean(form) && !isSubmitting,
    });

  useEffect(() => {
    if (!parsedId) {
      setIsLoading(false);
      setLoadError('Teacher not found.');
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    adminApi
      .teacher(token, parsedId)
      .then((response) => {
        if (cancelled) return;
        const teacher = response?.data;
        if (!teacher) {
          setLoadError('Teacher not found.');
          setForm(null);
          return;
        }
        initialStatusRef.current = teacher.status || 'active';
        const loadedForm = {
          fullName: teacher.fullName || '',
          email: teacher.email || '',
          username: teacher.username || '',
          password: '',
          status: teacher.status === 'inactive' ? 'inactive' : 'active',
          assignedSubjects: Array.isArray(teacher.assignedUniqueSubjectIds)
            ? teacher.assignedUniqueSubjectIds.map((id) => Number(id))
            : [],
        };
        originalFormRef.current = normalizeTeacherFormSnapshot(loadedForm);
        setForm(loadedForm);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Could not load teacher.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parsedId, token]);

  function onChange(field, value) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (formError) setFormError('');
  }

  function onToggleSubject(subjectId) {
    const id = Number(subjectId);
    setForm((prev) => {
      if (!prev) return prev;
      const selected = prev.assignedSubjects.includes(id)
        ? prev.assignedSubjects.filter((value) => value !== id)
        : [...new Set([...prev.assignedSubjects, id])];
      return { ...prev, assignedSubjects: selected };
    });
    setFieldErrors((prev) => {
      if (!prev.assignedSubjects) return prev;
      const next = { ...prev };
      delete next.assignedSubjects;
      return next;
    });
  }

  async function performUpdate() {
    if (!form || !parsedId) return;

    const payload = buildUpdateTeacherPayload(form);

    setIsSubmitting(true);
    setConfirmBusy(true);
    try {
      await adminApi.updateTeacher(token, parsedId, payload);
      originalFormRef.current = normalizeTeacherFormSnapshot({ ...form, password: '' });
      toast.success('Teacher updated successfully.');
      setConfirmDeactivate(false);
      navigate(adminRoute('teachers'));
    } catch (err) {
      const mapped = mapTeacherApiError(err);
      if (mapped.form) setFormError(mapped.form);
      const { form: _form, ...fieldMapped } = mapped;
      if (Object.keys(fieldMapped).length) {
        setFieldErrors((prev) => ({ ...prev, ...fieldMapped }));
      }
      if (!mapped.form && !Object.keys(fieldMapped).length) {
        setFormError(err.message || 'Could not update teacher. Please try again.');
      }
      toast.error(mapped.form || err.message || 'Could not update teacher.');
    } finally {
      setIsSubmitting(false);
      setConfirmBusy(false);
      pendingSubmitRef.current = false;
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!form || !parsedId || isSubmitting) return;
    setFormError('');

    const errors = validateTeacherForm(form, { mode: 'edit' });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setFormError('Please fix the highlighted fields.');
      return;
    }

    const subjectValidation = validateSelectedSubjectIds(form.assignedSubjects, subjects);
    if (!subjectValidation.valid) {
      setFieldErrors({ assignedSubjects: subjectValidation.error });
      return;
    }

    if (!hasTeacherFormChanges(form, originalFormRef.current)) {
      toast.info('No changes to save.');
      return;
    }

    const deactivating =
      form.status === 'inactive' && initialStatusRef.current !== 'inactive';

    if (deactivating) {
      pendingSubmitRef.current = true;
      setConfirmDeactivate(true);
      return;
    }

    await performUpdate();
  }

  async function confirmDeactivation() {
    await performUpdate();
  }

  const formDisabled = isLoading || isSubmitting || !form;

  if (!parsedId || loadError) {
    return (
      <section className="admin-page admin-page--teachers">
        <section className="admin-card">
          <div className="admin-empty-state">
            <p className="admin-empty-state__title">Teacher not found</p>
            <p className="admin-empty-state__text">{loadError || 'This teacher could not be loaded.'}</p>
            <Link className="btn btn--primary admin-touch-target" to={adminRoute('teachers')}>
              Back to teachers
            </Link>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="admin-page admin-page--teachers">
      <section className="admin-card">
        <header className="admin-courses-page-header admin-courses-page-header--compact">
          <div>
            <h1 className="admin-courses-page-header__title">Edit teacher</h1>
            <p className="admin-courses-page-header__subtitle">
              Update teacher details, subject assignments, and account status.
            </p>
          </div>
        </header>

        {isLoading || !form ? (
          <TeacherFormSkeleton />
        ) : (
          <TeacherForm
            mode="edit"
            form={form}
            fieldErrors={fieldErrors}
            formError={formError}
            subjects={subjects}
            subjectsLoading={subjectsLoading}
            subjectsLoadError={subjectsLoadError}
            isSubmitting={isSubmitting}
            isFormDisabled={formDisabled}
            onChange={onChange}
            onToggleSubject={onToggleSubject}
            onSubmit={onSubmit}
            onCancelTo={adminRoute('teachers')}
          />
        )}
      </section>

      <AdminConfirmDialog
        open={confirmDeactivate}
        title="Deactivate teacher"
        message="Are you sure you want to deactivate this teacher? They will no longer be able to log in or receive new student questions."
        confirmLabel="Deactivate and update"
        danger
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) {
            setConfirmDeactivate(false);
            pendingSubmitRef.current = false;
            if (initialStatusRef.current !== 'inactive') {
              setForm((prev) => (prev ? { ...prev, status: initialStatusRef.current } : prev));
            }
          }
        }}
        onConfirm={confirmDeactivation}
      />

      <AdminConfirmDialog
        open={isNavigationBlocked}
        title="Leave without saving?"
        message="You have unsaved changes. If you leave now, your updates will be lost."
        confirmLabel="Leave page"
        cancelLabel="Stay on page"
        danger
        onCancel={cancelNavigation}
        onConfirm={() => confirmNavigation(navigate)}
      />
    </section>
  );
}
