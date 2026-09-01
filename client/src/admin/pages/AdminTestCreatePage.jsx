import { useEffect, useState } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import { TEST_WIZARD_BUTTONS } from '../config/testWizardConfig';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import { buildTestBasicInfoPayload, createDefaultTestBasicInfoForm } from '../utils/testBasicInfoValidation';
import { useTestCreateOptions } from '../hooks/useTestCreateOptions';
import PremiumCheckboxGroup from '../components/ui/PremiumCheckboxGroup';
import PremiumRadioGroup from '../components/ui/PremiumRadioGroup';
import { isStandaloneAccessType, TEST_ACCESS_TYPE_OPTIONS } from '../constants/testAccessType.js';

/**
 * Minimal create flow — name + course + one or more subjects, then Dashboard.
 */
export default function AdminTestCreatePage() {
  const token = getAdminToken();
  const navigate = useNavigate();
  const toast = useAdminToast();
  const { options, isLoading: optionsLoading, error: optionsError } = useTestCreateOptions(token);

  const [title, setTitle] = useState('');
  const [testAccessType, setTestAccessType] = useState('course_locked');
  const [courseId, setCourseId] = useState('');
  const [subjectIds, setSubjectIds] = useState(/** @type {number[]} */ ([]));
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const standalone = isStandaloneAccessType(testAccessType);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setCoursesLoading(true);
    adminApi
      .courses(token)
      .then((response) => {
        if (cancelled) return;
        const list = Array.isArray(response?.data) ? response.data : [];
        setCourses(list);
        if (list.length === 1 && !isStandaloneAccessType(testAccessType)) {
          setCourseId(String(list[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, testAccessType]);

  useEffect(() => {
    if (standalone) {
      let cancelled = false;
      setSubjectsLoading(true);
      adminApi
        .uniqueActiveSubjects(token)
        .then((response) => {
          if (cancelled) return;
          const list = Array.isArray(response?.data) ? response.data : [];
          setSubjects(list);
        })
        .catch(() => {
          if (!cancelled) setSubjects([]);
        })
        .finally(() => {
          if (!cancelled) setSubjectsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if (!courseId) {
      setSubjects([]);
      setSubjectIds([]);
      return undefined;
    }
    let cancelled = false;
    setSubjectsLoading(true);
    adminApi
      .subjects(token, courseId)
      .then((response) => {
        if (cancelled) return;
        const list = Array.isArray(response?.data) ? response.data : [];
        setSubjects(list);
        if (list.length === 1) {
          setSubjectIds([Number(list[0].id)]);
        } else {
          setSubjectIds([]);
        }
      })
      .catch(() => {
        if (!cancelled) setSubjects([]);
      })
      .finally(() => {
        if (!cancelled) setSubjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, courseId, standalone]);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    const nextErrors = {};
    const trimmed = String(title).replace(/\s+/g, ' ').trim();
    if (trimmed.length < 3) {
      nextErrors.title = 'Test name must be at least 3 characters.';
    }

    if (!standalone && !courseId) {
      nextErrors.course_id = 'Select a course for this test.';
    }

    if (!subjectIds.length) {
      nextErrors.subject_ids = standalone
        ? 'Select at least one subject for this standalone test.'
        : 'Select at least one subject for this test.';
    }

    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setError('Fix the highlighted fields, then try again.');
      return;
    }

    const form = createDefaultTestBasicInfoForm({
      defaultCategory: options.defaultCategory,
      defaultTestType: options.defaultTestType,
    });
    form.test_access_type = testAccessType;
    form.course_id = standalone ? '' : courseId;
    form.title = trimmed;

    if (subjectIds.length === 1) {
      form.test_type = 'subject_wise';
      form.subject_id = String(subjectIds[0]);
      form.subject_ids = [];
    } else {
      form.test_type = 'mixed_subject';
      form.subject_id = '';
      form.subject_ids = subjectIds;
    }

    const payload = buildTestBasicInfoPayload(form);

    setIsSubmitting(true);
    try {
      const response = await adminApi.createTest(token, payload);
      const testId = response?.data?.testId;
      if (!testId) {
        throw new Error('Test was created but no test id was returned.');
      }
      toast.success(
        standalone
          ? 'Test created. Set the schedule, seats, and timer in Settings before publishing.'
          : 'Test created.'
      );
      navigate(adminRoute(`tests/${testId}/dashboard`));
    } catch (err) {
      setError(err.message || 'Failed to create test.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const loading = optionsLoading || coursesLoading;
  const showSubjectPicker = standalone || Boolean(courseId);

  return (
    <section className="admin-page admin-page--test-setup">
      <section className="admin-card">
        <AdminTestPageHeader title="Create test" backLabel={TEST_WIZARD_BUTTONS.backToTests} />

        <p className="test-setup-section__lead" style={{ marginBottom: 'var(--space-6)' }}>
          Choose the test type, enter a name, and select subjects. Scheduling, seats, and price for
          standalone tests are configured in Settings after creation.
        </p>

        {loading ? <p className="body-md admin-courses__muted">Loading…</p> : null}
        {optionsError ? <p className="admin-error">{optionsError}</p> : null}

        <div className="admin-test-form-section">
          <form className="admin-test-form admin-test-form--unified" onSubmit={onSubmit} noValidate>
            <div className="test-setup-fields">
              <PremiumRadioGroup
                legend="Test type"
                name="create_test_access_type"
                value={testAccessType}
                disabled={isSubmitting}
                options={TEST_ACCESS_TYPE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  hint: option.description,
                }))}
                onChange={(nextType) => {
                  setTestAccessType(nextType);
                  setSubjectIds([]);
                  if (isStandaloneAccessType(nextType)) {
                    setCourseId('');
                  }
                }}
              />

              <div className="admin-field">
                <label htmlFor="new-test-title">Test name</label>
                <input
                  id="new-test-title"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={120}
                  autoFocus
                  disabled={isSubmitting}
                  placeholder="e.g. Mathematics Final Exam 2026"
                  aria-invalid={Boolean(fieldErrors.title)}
                />
                {fieldErrors.title ? <div className="admin-field__error">{fieldErrors.title}</div> : null}
              </div>

              {!standalone && (courses.length > 1 || !courseId) ? (
                <div className="admin-field">
                  <label htmlFor="new-test-course">Course</label>
                  <select
                    id="new-test-course"
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    required
                    disabled={isSubmitting || loading}
                    aria-invalid={Boolean(fieldErrors.course_id)}
                  >
                    <option value="">Select course</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.course_id ? <div className="admin-field__error">{fieldErrors.course_id}</div> : null}
                </div>
              ) : null}
            </div>

            {showSubjectPicker ? (
              <div className="admin-field">
                <PremiumCheckboxGroup
                  legend="Subjects"
                  options={
                    subjectsLoading
                      ? []
                      : subjects.map((subject) => ({
                          value: Number(subject.id),
                          label: subject.title ?? subject.name ?? `Subject #${subject.id}`,
                        }))
                  }
                  selectedValues={subjectIds}
                  onChange={(nextIds) => setSubjectIds(nextIds)}
                  disabled={isSubmitting}
                  emptyMessage={
                    subjectsLoading
                      ? 'Loading subjects…'
                      : standalone
                        ? 'No active subjects found.'
                        : 'No subjects found for this course.'
                  }
                />
                <p className="admin-field__hint">Select every subject this test will include.</p>
                {fieldErrors.subject_ids ? (
                  <div className="admin-field__error">{fieldErrors.subject_ids}</div>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="admin-error">{error}</p> : null}

            <div className="admin-test-form__footer admin-test-form__footer--unified">
              <button className="btn btn--primary" type="submit" disabled={isSubmitting || loading}>
                {isSubmitting ? 'Creating…' : 'Create test'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </section>
  );
}
