import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import CourseEnrollmentCtaButton from '../components/course/CourseEnrollmentCtaButton';
import { enrollmentApi } from '../api/enrollmentApi';
import { courseApi } from '../api/courseApi';
import EnrollmentForm from '../components/enrollment/EnrollmentForm.jsx';
import { ENROLLMENT_BUTTON_STATE } from '../course/courseEnrollmentCta';
import { extractCourseAdmission, isAdmissionOpen } from '../course/courseAdmissionPresentation';
import { useEnrollment } from '../hooks/useEnrollment';
import { useEnrollmentPrefill } from '../hooks/useEnrollmentPrefill';
import { getUserFacingErrorMessage } from '../utils/errorHandler';
import './EnrollmentPage.css';

const INITIAL_FORM = {
  email: '',
  applicantFullName: '',
  fatherName: '',
  dateOfBirth: '',
  gender: 'male',
  whatsappNumber: '',
  province_id: '',
  district_id: '',
  city_id: '',
  hsscStatus: '',
  board_id: '',
  mdcatAttemptType: 'Fresher',
};

function normalizePakistaniNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return `+${digits}`;
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
  if (digits.startsWith('3')) return `+92${digits}`;
  return `+${digits}`;
}

/** Same rule as normalized payload sent to API: +923 + 9 digits (after the leading 3). */
function isValidPakistaniWhatsappNormalized(value) {
  return /^\+923[0-9]{9}$/.test(String(value || ''));
}

function validateForm(form) {
  const errors = {};
  if (!form.email.trim()) errors.email = 'Email is required';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address';
  if (!form.applicantFullName.trim()) errors.applicantFullName = "Applicant's full name is required";
  if (!form.fatherName.trim()) errors.fatherName = "Father's name is required";
  if (!String(form.whatsappNumber || '').trim()) errors.whatsappNumber = 'WhatsApp number is required';
  else {
    const whatsappNormalized = normalizePakistaniNumber(form.whatsappNumber);
    if (!isValidPakistaniWhatsappNormalized(whatsappNormalized)) {
      errors.whatsappNumber = 'Enter a valid Pakistan WhatsApp number';
    }
  }
  if (!String(form.province_id || '').trim()) errors.province_id = 'Province is required';
  if (!String(form.district_id || '').trim()) errors.district_id = 'District is required';
  if (!String(form.city_id || '').trim()) errors.city_id = 'City is required';
  if (!form.hsscStatus) errors.hsscStatus = 'Please select your HSSC status';
  if (!String(form.board_id || '').trim()) errors.board_id = 'Board is required';
  if (!form.mdcatAttemptType) errors.mdcatAttemptType = 'Select MDCAT attempt history';
  return errors;
}

export default function EnrollmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { courseId: routeCourseId } = useParams();
  const confirmSwitch = searchParams.get('confirmSwitch') === '1';
  const targetCourseIdParam = searchParams.get('targetCourseId');
  const courseId = useMemo(() => {
    const fromRoute = Number(String(routeCourseId || '').trim());
    if (Number.isInteger(fromRoute) && fromRoute > 0) return fromRoute;
    const fromQuery = Number(String(targetCourseIdParam || '').trim());
    return Number.isInteger(fromQuery) && fromQuery > 0 ? fromQuery : null;
  }, [routeCourseId, targetCourseIdParam]);
  const { state: enrollmentState, loading: enrollmentLoading } = useEnrollment(courseId);
  const [course, setCourse] = useState(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setCourse(null);
      setCourseLoading(false);
      return undefined;
    }
    (async () => {
      setCourseLoading(true);
      try {
        const res = await courseApi.getById(courseId);
        if (!cancelled) {
          setCourse(res?.data || null);
        }
      } catch {
        if (!cancelled) setCourse(null);
      } finally {
        if (!cancelled) setCourseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const courseAdmission = useMemo(() => extractCourseAdmission(course), [course]);
  const admissionsOpen = isAdmissionOpen(courseAdmission);
  const buttonState = enrollmentState?.buttonState ?? null;
  const isEnrolled =
    buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING ||
    enrollmentState?.isEnrolled === true;
  const admissionsClosedForProspect =
    !isEnrolled &&
    (buttonState === ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED || !admissionsOpen);
  const pageLoading = courseLoading || enrollmentLoading;
  const formEnabled = !pageLoading && !isEnrolled && !admissionsClosedForProspect;

  const {
    loading: prefillLoading,
    sourceCourseName,
    sourceEnrollmentId,
    availableSources,
    prefillFields,
    prefilledFieldNames,
    discardedFields,
    loadPrefill,
    clearPrefillState,
  } = useEnrollmentPrefill({
    targetCourseId: courseId,
    enabled: formEnabled,
  });

  const [selectedSourceEnrollmentId, setSelectedSourceEnrollmentId] = useState(null);
  const [activePrefilledFields, setActivePrefilledFields] = useState(new Set());

  useEffect(() => {
    if (!formEnabled || prefillLoading) return;
    if (!prefilledFieldNames.length) {
      setActivePrefilledFields(new Set());
      return;
    }
    setForm({ ...INITIAL_FORM, ...prefillFields });
    setActivePrefilledFields(new Set(prefilledFieldNames));
  }, [formEnabled, prefillLoading, prefillFields, prefilledFieldNames]);

  useEffect(() => {
    if (!formEnabled) {
      setSelectedSourceEnrollmentId(null);
      setActivePrefilledFields(new Set());
    }
  }, [formEnabled, courseId]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setActivePrefilledFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  function handleClearPrefill() {
    setForm(INITIAL_FORM);
    setErrors({});
    clearPrefillState();
    setActivePrefilledFields(new Set());
  }

  async function handleSourceChange(event) {
    const nextId = event.target.value ? Number(event.target.value) : null;
    setSelectedSourceEnrollmentId(nextId);
    await loadPrefill(nextId);
  }

  function updateLocationFields(nextSelection) {
    setForm((prev) => ({ ...prev, ...nextSelection }));
    setErrors((prev) => ({
      ...prev,
      province_id: '',
      district_id: '',
      city_id: '',
    }));
    setActivePrefilledFields((prev) => {
      const next = new Set(prev);
      for (const key of ['province_id', 'district_id', 'city_id']) {
        if (nextSelection[key] !== undefined) next.delete(key);
      }
      return next;
    });
  }

  async function handleSubmit() {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitError('');
    if (!courseId) {
      setSubmitError('Please open enrollment from a course page so the course can be selected automatically.');
      return;
    }
    if (admissionsClosedForProspect) {
      setSubmitError(courseAdmission.enrollment_message || 'Enrollment is closed for this course.');
      return;
    }
    if (enrollmentState?.requiresSwitchConfirmation && !confirmSwitch) {
      setSubmitError('Please confirm the course switch before completing enrollment.');
      return;
    }
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError('Please fix the highlighted fields.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const res = await enrollmentApi.create(
        {
          email: form.email.trim(),
          applicantFullName: form.applicantFullName.trim(),
          fatherName: form.fatherName.trim(),
          dateOfBirth: form.dateOfBirth || '',
          gender: form.gender,
          whatsappNumber: normalizePakistaniNumber(form.whatsappNumber),
          province_id: form.province_id,
          district_id: form.district_id,
          city_id: form.city_id,
          hsscStatus: form.hsscStatus,
          board_id: form.board_id,
          mdcatAttemptType: form.mdcatAttemptType,
          course_id: String(courseId),
          confirmSwitch: confirmSwitch || undefined,
        }
      );
      const payload = res?.data;
      const enrollment = payload?.enrollment ?? payload;
      const accessGranted = Boolean(payload?.access_granted);
      const paymentRequired = Boolean(payload?.payment_required);
      const checkoutUrl = payload?.checkout_url ?? null;

      setForm(INITIAL_FORM);

      if (accessGranted) {
        navigate('/dashboard/lectures', { replace: true });
        return;
      }

      if (paymentRequired && checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      navigate('/enrollment/payment', {
        replace: true,
        state: {
          enrollmentId: enrollment?.id ?? null,
          orderId: payload?.order_id ?? enrollment?.orderId ?? null,
          courseId,
        },
      });
    } catch (error) {
      setSubmitError(getUserFacingErrorMessage(error, 'Failed to submit enrollment.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageLayout>
      <section className="enrollment-shell">
        <div className="enrollment-card">
          <header className="enrollment-header">
            <p className="enrollment-step">Enrollment</p>
            <h1 className="heading-2">Student Registration Form</h1>
            {course?.title ? (
              <p className="enrollment-course-name">
                Course: <strong>{course.title}</strong>
              </p>
            ) : null}
            <p className="enrollment-subtitle">
              Fill in your academic and personal details carefully. Free courses unlock immediately; paid courses continue to secure checkout.
            </p>
          </header>

          {pageLoading ? (
            <p className="enrollment-status-message">Checking admission status…</p>
          ) : null}

          {!pageLoading && isEnrolled ? (
            <div className="enrollment-status-panel enrollment-status-panel--active" role="status">
              <h2 className="heading-4">You&apos;re already enrolled</h2>
              <p className="enrollment-status-message">
                {admissionsOpen
                  ? 'Your enrollment is active. Continue learning from your dashboard.'
                  : 'Admissions are closed for new students, but your access remains active.'}
              </p>
              <CourseEnrollmentCtaButton
                courseId={courseId}
                labelContext="card"
                size="lg"
                enrollmentState={enrollmentState}
                courseAdmission={courseAdmission}
              />
            </div>
          ) : null}

          {!pageLoading && admissionsClosedForProspect ? (
            <div className="enrollment-status-panel enrollment-status-panel--closed" role="status">
              <h2 className="heading-4">Enrollment closed</h2>
              <p className="enrollment-status-message">
                {courseAdmission.enrollment_message || 'Admissions are currently closed for this course.'}
              </p>
              <div className="enrollment-status-actions">
                <Button as={Link} to={courseId ? `/courses/${courseId}` : '/courses'} variant="secondary" size="md">
                  Back to course
                </Button>
                <Button as={Link} to="/courses" variant="primary" size="md">
                  Browse courses
                </Button>
              </div>
            </div>
          ) : null}

          {submitError ? <p className="enrollment-error">{submitError}</p> : null}

          {!pageLoading && !isEnrolled && !admissionsClosedForProspect ? (
            <>
              {prefillLoading ? (
                <p className="enrollment-status-message">Loading your saved information…</p>
              ) : null}

              {availableSources.length > 1 ? (
                <div className="enrollment-prefill-source">
                  <label htmlFor="prefill-source-select" className="enrollment-prefill-source__label">
                    Import registration data from
                  </label>
                  <select
                    id="prefill-source-select"
                    className="enrollment-prefill-source__select"
                    value={selectedSourceEnrollmentId ?? sourceEnrollmentId ?? ''}
                    onChange={handleSourceChange}
                    disabled={prefillLoading}
                  >
                    {availableSources.map((source) => (
                      <option key={source.enrollmentId} value={String(source.enrollmentId)}>
                        {source.courseName}
                        {source.isActive ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {activePrefilledFields.size > 0 && sourceCourseName ? (
                <div className="enrollment-prefill-banner" role="status">
                  <p>
                    We&apos;ve pre-filled your information from your previous enrollment in{' '}
                    <strong>{sourceCourseName}</strong>. Please review and update if needed.
                  </p>
                  <button type="button" className="enrollment-prefill-clear" onClick={handleClearPrefill}>
                    Clear all pre-filled data
                  </button>
                </div>
              ) : null}

              <EnrollmentForm
                form={form}
                errors={errors}
                prefilledFields={activePrefilledFields}
                discardedFields={discardedFields}
                onChangeField={updateField}
                onLocationChange={updateLocationFields}
                onSubmit={handleSubmit}
                onCancel={() => navigate(-1)}
                submitLabel={isSubmitting ? 'Saving...' : 'Complete enrollment'}
                submitting={isSubmitting}
              />
            </>
          ) : null}
        </div>
      </section>
    </PageLayout>
  );
}
