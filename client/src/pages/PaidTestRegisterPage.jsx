import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import EnrollmentForm from '../components/enrollment/EnrollmentForm.jsx';
import { standaloneTestsApi, markPaidStandaloneSession } from '../api/standaloneTestsApi';
import { getUserFacingErrorMessage } from '../utils/errorHandler';
import { getStudentToken } from '../auth/session';
import { usePageSeo } from '../seo/SeoContext';
import './EnrollmentPage.css';
import './paid-test-page.css';

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

function validateRegistration(form) {
  const errors = {};
  if (!String(form.email || '').trim()) errors.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (String(form.applicantFullName || '').trim().length < 3) {
    errors.applicantFullName = 'Enter your full name.';
  }
  if (String(form.fatherName || '').trim().length < 3) {
    errors.fatherName = 'Enter your father’s name.';
  }
  if (!String(form.whatsappNumber || '').trim()) {
    errors.whatsappNumber = 'Enter a WhatsApp number.';
  }
  if (!form.province_id) errors.province_id = 'Select a province.';
  if (!form.district_id) errors.district_id = 'Select a district.';
  if (!form.city_id) errors.city_id = 'Select a city.';
  if (!form.hsscStatus) errors.hsscStatus = 'Select your class or HSSC status.';
  if (!form.board_id) errors.board_id = 'Select a board.';
  if (!form.mdcatAttemptType) errors.mdcatAttemptType = 'Select your attempt type.';
  return errors;
}

export default function PaidTestRegisterPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  usePageSeo({
    title: 'Register for paid test | MRB Classes',
    description: 'Complete your MRB Classes paid test registration.',
    noindex: true,
  });

  function onChangeField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  const fieldCount = useMemo(() => Object.keys(errors).length, [errors]);

  async function onSubmit() {
    if (!getStudentToken()) {
      navigate(`/login?redirect=${encodeURIComponent(`/paid-tests/${slug}/register`)}`);
      return;
    }
    const nextErrors = validateRegistration(form);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setError('Please complete the highlighted fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await standaloneTestsApi.register(slug, {
        applicantFullName: form.applicantFullName.trim(),
        fatherName: form.fatherName.trim(),
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender,
        whatsappNumber: normalizePakistaniNumber(form.whatsappNumber),
        email: form.email.trim(),
        province_id: Number(form.province_id),
        district_id: Number(form.district_id),
        city_id: Number(form.city_id),
        board_id: form.board_id ? Number(form.board_id) : null,
        hsscStatus: form.hsscStatus,
        mdcatAttemptType: form.mdcatAttemptType,
      });
      const orderId = result?.data?.orderId;
      markPaidStandaloneSession(slug);
      navigate(`/paid-tests/${encodeURIComponent(slug)}/pay?order_id=${encodeURIComponent(orderId)}`);
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Could not complete registration.'));
      setErrors(err.details?.fieldErrors || {});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageLayout>
      <div className="enrollment-shell">
        <div className="enrollment-card">
          <header className="enrollment-header">
            <p className="enrollment-step">Paid test registration</p>
            <h1 className="heading-2">Student information</h1>
            <p className="enrollment-subtitle">
              Use the same details as a course enrolment. This registration is for this test only and
              does not enrol you in a course.
            </p>
          </header>
          {error ? (
            <p className="enrollment-field__error" role="alert">
              {error}
              {fieldCount ? ` (${fieldCount} ${fieldCount === 1 ? 'field needs' : 'fields need'} attention)` : ''}
            </p>
          ) : null}
          <EnrollmentForm
            form={form}
            errors={errors}
            onChangeField={onChangeField}
            onLocationChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
            onSubmit={onSubmit}
            onCancel={() => navigate(`/paid-tests/${encodeURIComponent(slug)}`)}
            submitLabel={submitting ? 'Saving…' : 'Continue to payment'}
            submitting={submitting}
          />
        </div>
      </div>
    </PageLayout>
  );
}
