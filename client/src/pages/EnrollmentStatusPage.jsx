import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import { studentApi } from '../api/studentApi';
import './EnrollmentStatusPage.css';

const POLL_MS_PENDING = 20000;

function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export default function EnrollmentStatusPage() {
  const [params] = useSearchParams();
  const token = (params.get('token') || '').trim();

  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError('');
      const res = await studentApi.trackEnrollment(token);
      setTracking(res?.data || null);
    } catch (err) {
      setError(err.message || 'Unable to load your registration status.');
      setTracking(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token || !tracking || tracking.status !== 'pending') return undefined;
    const id = window.setInterval(() => {
      load();
    }, POLL_MS_PENDING);
    return () => window.clearInterval(id);
  }, [token, tracking?.status, load]);

  const statusUi = useMemo(() => {
    const raw = tracking?.status || 'pending';
    if (raw === 'approved' || raw === 'verified') {
      return {
        key: 'accepted',
        label: 'Accepted',
        tone: 'success',
        headline: 'Your enrollment is approved',
        detail:
          'MRB Classes has approved your registration after payment confirmation. Welcome aboard — your student dashboard will reflect your lectures and tests as soon as course access is turned on.',
        extras:
          'If you already have an MRB student account, please sign in. If not, complete student registration next so everything stays under one login.',
      };
    }
    if (raw === 'rejected') {
      return {
        key: 'denied',
        label: 'Not approved',
        tone: 'danger',
        headline: 'We could not approve this enrollment',
        detail:
          'Our team reviewed your submission and marked it as not approved. This may relate to unclear payment proof, mismatched transaction details, or policy reasons.',
        extras:
          'Please contact MRB support through the website with your reference details. We remain happy to guide you toward the correct next step.',
      };
    }
    return {
      key: 'pending',
      label: 'Pending verification',
      tone: 'pending',
      headline: 'Thank you — you will be added soon',
      detail:
        'Your registration has reached the admin team safely. In most cases review is completed in a short time after payment confirmation. Please refresh this page or return later; status updates automatically every few moments while we are still reviewing.',
      extras:
        'Once approved, you will be able to access your lectures and all tests from your student portal. We appreciate your patience and your trust in MRB Classes.',
    };
  }, [tracking?.status]);

  if (!token) {
    return (
      <PageLayout>
        <section className="enrollment-shell enrollment-status-shell">
          <article className="enrollment-status-card enrollment-status-card--narrow">
            <h1 className="heading-2">Track your enrollment</h1>
            <p className="enrollment-status-lead">
              This page opens automatically after you submit the registration form. If you landed here directly, please
              open the confirmation link from your submission email or bookmarks, or use the link saved when you finished
              enrollment.
            </p>
            <div className="enrollment-status-actions">
              <Button as={Link} to="/courses" variant="accent" size="md">
                Browse courses
              </Button>
              <Button as={Link} to="/" variant="secondary" size="md">
                Back to home
              </Button>
            </div>
          </article>
        </section>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="enrollment-shell enrollment-status-shell">
        <article className="enrollment-status-card">
          <p className="enrollment-status-eyebrow">MRB Classes</p>

          {loading && !tracking ? (
            <>
              <h1 className="heading-2">Loading your status…</h1>
              <p className="enrollment-status-lead">Fetching the latest verification state from our team.</p>
            </>
          ) : error ? (
            <>
              <h1 className="heading-2">Could not load status</h1>
              <p className="enrollment-status-lead enrollment-status-error">{error}</p>
              <div className="enrollment-status-actions">
                <Button type="button" variant="accent" size="md" onClick={() => load()}>
                  Try again
                </Button>
                <Button as={Link} to="/contact" variant="secondary" size="md">
                  Contact us
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className={`enrollment-status-badge enrollment-status-badge--${statusUi.tone}`}>
                <span className="enrollment-status-badge__dot" aria-hidden />
                {statusUi.label}
              </div>
              <h1 className="heading-2 enrollment-status-heading">{statusUi.headline}</h1>
              {tracking?.applicantFullName ? (
                <p className="enrollment-status-name">
                  Application for <strong>{tracking.applicantFullName}</strong>
                </p>
              ) : null}
              <p className="enrollment-status-lead">{statusUi.detail}</p>
              <p className="enrollment-status-extra">{statusUi.extras}</p>

              {(tracking?.submittedAt || tracking?.reviewedAt) && (
                <dl className="enrollment-status-meta">
                  {tracking?.submittedAt ? (
                    <div className="enrollment-status-meta__row">
                      <dt>Submitted</dt>
                      <dd>{formatWhen(tracking.submittedAt)}</dd>
                    </div>
                  ) : null}
                  {tracking?.reviewedAt ? (
                    <div className="enrollment-status-meta__row">
                      <dt>Decision recorded</dt>
                      <dd>{formatWhen(tracking.reviewedAt)}</dd>
                    </div>
                  ) : null}
                </dl>
              )}

              {tracking?.status === 'pending' ? (
                <p className="enrollment-status-poll-note">Updating in the background automatically while status is Pending.</p>
              ) : null}

              <div className="enrollment-status-actions">
                {tracking?.status === 'approved' || tracking?.status === 'verified' ? (
                  <Button as={Link} to="/login" variant="accent" size="md">
                    Go to student login
                  </Button>
                ) : (
                  <Button as={Link} to="/courses" variant="accent" size="md">
                    Browse courses
                  </Button>
                )}
                <Button as={Link} to="/contact" variant="secondary" size="md">
                  Contact support
                </Button>
                <Button as={Link} to="/" variant="ghost" size="md">
                  Home
                </Button>
              </div>
            </>
          )}
        </article>
      </section>
    </PageLayout>
  );
}
