import { adminRoute } from '../../config/adminPaths';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import TeacherForm from '../components/teachers/TeacherForm';
import { useUniqueTeacherSubjects, validateSelectedSubjectIds } from '../hooks/useUniqueTeacherSubjects';
import { useAdminToast } from '../context/AdminToastContext';
import { mapTeacherApiError, validateTeacherForm } from '../utils/teacherFormValidation';
import '../styles/admin-courses-dashboard.css';
import '../styles/admin-teachers.css';

const INITIAL_FORM = {
  fullName: '',
  email: '',
  username: '',
  password: '',
  status: 'active',
  assignedSubjects: [],
};

function generateIdempotencyKey() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `teacher-create-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function AdminTeacherCreatePage() {
  const token = getAdminToken();
  const navigate = useNavigate();
  const toast = useAdminToast();
  const idempotencyKeyRef = useRef(null);

  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { subjects, isLoading: subjectsLoading, error: subjectsLoadError } = useUniqueTeacherSubjects(token);

  function onChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
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

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');

    const errors = validateTeacherForm(form, { mode: 'create' });
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

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }

    setIsSubmitting(true);
    try {
      await adminApi.createTeacher(
        token,
        {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          username: form.username.trim().toLowerCase(),
          password: form.password,
          status: form.status,
          assignedSubjects: subjectValidation.ids,
        },
        { idempotencyKey: idempotencyKeyRef.current }
      );

      idempotencyKeyRef.current = null;
      toast.success('Teacher created successfully.');
      navigate(adminRoute('teachers'));
    } catch (err) {
      const mapped = mapTeacherApiError(err);
      if (mapped.form) setFormError(mapped.form);
      const { form: _form, ...fieldMapped } = mapped;
      if (Object.keys(fieldMapped).length) {
        setFieldErrors((prev) => ({ ...prev, ...fieldMapped }));
      }
      if (!mapped.form && !Object.keys(fieldMapped).length) {
        setFormError(err.message || 'Could not create teacher. Please try again.');
      }
      toast.error(mapped.form || err.message || 'Could not create teacher.');
      idempotencyKeyRef.current = null;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-page admin-page--teachers">
      <section className="admin-card">
        <header className="admin-courses-page-header admin-courses-page-header--compact">
          <div>
            <h1 className="admin-courses-page-header__title">Create teacher</h1>
            <p className="admin-courses-page-header__subtitle">
              Add a new teacher account with subject assignments and login credentials.
            </p>
          </div>
        </header>

        <TeacherForm
          mode="create"
          form={form}
          fieldErrors={fieldErrors}
          formError={formError}
          subjects={subjects}
          subjectsLoading={subjectsLoading}
          subjectsLoadError={subjectsLoadError}
          isSubmitting={isSubmitting}
          onChange={onChange}
          onToggleSubject={onToggleSubject}
          onSubmit={onSubmit}
          onCancelTo={adminRoute('teachers')}
        />
      </section>
    </section>
  );
}
