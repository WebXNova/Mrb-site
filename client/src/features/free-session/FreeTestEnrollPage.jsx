import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import EnrollmentForm from '../../components/enrollment/EnrollmentForm.jsx';
import { standaloneTestsApi } from '../../api/standaloneTestsApi';
import { usePageSeo } from '../../seo/SeoContext';
import { getUserFacingErrorMessage } from '../../utils/errorHandler';
import { freeTestPath, markFreeSessionGuest } from './freeSessionNav';
import { withSafeFromQuery } from '../../utils/authRedirect';
import '../../pages/EnrollmentPage.css';

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

export default function FreeTestEnrollPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  usePageSeo({
    title: 'Complete your information | MRB Classes',
    description: 'Complete your details to save your free session result.',
    noindex: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await standaloneTestsApi.freeSessionStatus(slug);
        const data = response?.data;
        if (cancelled) return;
        if (data?.nextStep === 'exam') {
          navigate(freeTestPath(slug, 'start'), { replace: true });
          return;
        }
        if (data?.nextStep === 'account' || data?.nextStep === 'result') {
          navigate(freeTestPath(slug, data.nextStep === 'result' ? 'result' : 'claim'), { replace: true });
          return;
        }
        if (data?.nextStep !== 'enrollment') {
          navigate(freeTestPath(slug), { replace: true });
          return;
        }
        markFreeSessionGuest(slug, true);
        if (data.studentName) {
          setForm((prev) => ({ ...prev, applicantFullName: data.studentName }));
        }
        setReady(true);
      } catch {
        if (!cancelled) navigate(freeTestPath(slug), { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, slug]);

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

  const onSubmit = useCallback(async () => {
    const nextErrors = validateRegistration(form);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setError('Please complete the highlighted fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await standaloneTestsApi.freeSessionEnrollment(slug, {
        applicantFullName: form.applicantFullName.trim(),
        fatherName: form.fatherName.trim(),
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender,
        whatsappNumber: normalizePakistaniNumber(form.whatsappNumber),
        email: form.email.trim(),
        province_id: Number(form.province_id),
        district_id: Number(form.district_id),
        city_id: Number(form.city_id),
        board_id: Number(form.board_id),
        hsscStatus: form.hsscStatus,
        mdcatAttemptType: form.mdcatAttemptType,
      });
      const claimPath = freeTestPath(slug, 'claim');
      navigate(claimPath, { replace: true });
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Could not save your information. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [form, navigate, slug]);

  if (!ready) {
    return (
      <PageLayout>
        <div className="enrollment-shell">
          <p>Loading…</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="enrollment-shell">
        <div className="enrollment-card">
          <header className="enrollment-header">
            <p className="enrollment-kicker">Step 5 of 7</p>
            <h1>Complete your information</h1>
            <p>
              Your test has been submitted. Fill in your details, then sign in or create an account to
              save your result. This does not enrol you in a course.
            </p>
          </header>
          {error ? (
            <p className="enrollment-banner enrollment-banner--error" role="alert">
              {error}
              {fieldCount ? ` (${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'})` : ''}
            </p>
          ) : null}
          <EnrollmentForm
            form={form}
            errors={errors}
            onChangeField={onChangeField}
            onSubmit={onSubmit}
            onCancel={() => navigate(freeTestPath(slug))}
            submitLabel="Continue to sign in"
            submitting={submitting}
          />
          <p>
            Already have an account?{' '}
            <Link to={withSafeFromQuery('/login', freeTestPath(slug, 'claim'))}>Sign in</Link>
            {' · '}
            <Link to={withSafeFromQuery('/register', freeTestPath(slug, 'claim'))}>Create account</Link>
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
