import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import { studentApi } from '../api/studentApi';
import EnrollmentForm from '../components/enrollment/EnrollmentForm.jsx';
import './EnrollmentPage.css';

const INITIAL_FORM = {
  email: '',
  applicantFullName: '',
  fatherName: '',
  dateOfBirth: '',
  gender: 'male',
  whatsappNumber: '',
  province_id: '',
  division_id: '',
  district_id: '',
  city_id: '',
  hsscStatus: '',
  board_id: '',
  batchNumber: '',
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
  if (!String(form.division_id || '').trim()) errors.division_id = 'Division is required';
  if (!String(form.district_id || '').trim()) errors.district_id = 'District is required';
  if (!String(form.city_id || '').trim()) errors.city_id = 'City is required';
  if (!form.hsscStatus) errors.hsscStatus = 'Please select your HSSC status';
  if (!String(form.board_id || '').trim()) errors.board_id = 'Board is required';
  if (!String(form.batchNumber || '').trim()) errors.batchNumber = 'Please select your batch';
  if (!form.mdcatAttemptType) errors.mdcatAttemptType = 'Select MDCAT attempt history';
  return errors;
}

export default function EnrollmentPage() {
  const navigate = useNavigate();
  const { courseId: routeCourseId } = useParams();
  const courseId = useMemo(() => {
    const parsed = Number(String(routeCourseId || '').trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [routeCourseId]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function updateLocationFields(nextSelection) {
    setForm((prev) => ({ ...prev, ...nextSelection }));
    setErrors((prev) => ({
      ...prev,
      province_id: '',
      division_id: '',
      district_id: '',
      city_id: '',
    }));
  }

  async function handleSubmit() {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitError('');
    if (!courseId) {
      setSubmitError('Please open enrollment from a course page so the course can be selected automatically.');
      return;
    }
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError('Please fix the highlighted fields.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const res = await studentApi.submitEnrollment(
        {
          email: form.email.trim(),
          applicantFullName: form.applicantFullName.trim(),
          fatherName: form.fatherName.trim(),
          dateOfBirth: form.dateOfBirth || '',
          gender: form.gender,
          whatsappNumber: normalizePakistaniNumber(form.whatsappNumber),
          province_id: form.province_id,
          division_id: form.division_id,
          district_id: form.district_id,
          city_id: form.city_id,
          hsscStatus: form.hsscStatus,
          board_id: form.board_id,
          mdcatAttemptType: form.mdcatAttemptType,
          batchNumber: form.batchNumber,
          course_id: String(courseId),
        }
      );
      const payload = res?.data;
      const enrollment = payload?.enrollment ?? payload;
      setForm(INITIAL_FORM);
      navigate('/enrollment/payment', {
        replace: true,
        state: {
          enrollmentId: enrollment?.id ?? null,
          orderId: enrollment?.orderId ?? null,
          courseId,
        },
      });
    } catch (error) {
      setSubmitError(error.message || 'Failed to submit enrollment.');
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
            <p className="enrollment-subtitle">Fill in your academic and personal details carefully, then continue to payment.</p>
          </header>

          {submitError ? <p className="enrollment-error">{submitError}</p> : null}

          <EnrollmentForm
            form={form}
            errors={errors}
            onChangeField={updateField}
            onLocationChange={updateLocationFields}
            onSubmit={handleSubmit}
            onCancel={() => navigate(-1)}
            submitLabel={isSubmitting ? 'Saving...' : 'Continue to Payment'}
            submitting={isSubmitting}
          />
        </div>
      </section>
    </PageLayout>
  );
}
