import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import { paymentsApi } from '../api/paymentsApi.js';
import './EnrollmentPage.css';

export default function EnrollmentPaymentPage() {
  const location = useLocation();
  const enrollmentId = location.state?.enrollmentId ?? null;
  const orderId = location.state?.orderId ?? null;
  const courseId = location.state?.courseId ?? null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleContinueToSafepay() {
    if (!enrollmentId || !courseId) {
      setError('Missing enrollment or course. Please complete enrollment again from the course page.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await paymentsApi.createSession({
        enrollmentId,
        courseId,
      });
      const checkoutUrl = response?.data?.checkout_url;
      if (!checkoutUrl) {
        setError('Payment session could not be started. Please try again.');
        return;
      }
      if (import.meta.env.DEV) {
        console.log('[safepay] client received checkout_url:', checkoutUrl);
      } else {
        try {
          const u = new URL(checkoutUrl);
          u.searchParams.set('beacon', '(redacted)');
          console.log('[safepay] client redirect (beacon redacted):', u.toString());
        } catch {
          /* ignore */
        }
      }
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err?.message || 'Failed to start Safepay checkout.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout>
      <section className="enrollment-shell">
        <div className="enrollment-card enrollment-payment-next">
          <header className="enrollment-header">
            <p className="enrollment-step">Payment</p>
            <h1 className="heading-2">Continue to Safepay</h1>
            <p className="enrollment-subtitle">
              Your enrollment draft has been saved. Complete your Safepay payment to continue.
            </p>
          </header>

          <div className="enrollment-payment-next__summary">
            <p><strong>Enrollment ID:</strong> {enrollmentId ?? 'Pending'}</p>
            <p><strong>Order ID:</strong> {orderId ?? 'Created when you continue to Safepay'}</p>
            <p><strong>Course ID:</strong> {courseId ?? 'Unknown'}</p>
          </div>

          {error ? <p className="enrollment-error">{error}</p> : null}

          <article className="enrollment-payment-next__notice">
            Payment confirmation is automatic via Safepay. Course access is granted after payment is verified — not on this page.
          </article>

          <div className="enrollment-actions">
            <Button as={Link} to="/courses" variant="secondary" size="md" disabled={loading}>
              Back to courses
            </Button>
            <Button
              type="button"
              variant="accent"
              size="md"
              disabled={loading || !enrollmentId || !courseId}
              onClick={handleContinueToSafepay}
            >
              {loading ? (
                <>
                  <span className="enrollment-spinner" aria-hidden="true" />
                  Starting checkout…
                </>
              ) : (
                'Continue to Safepay'
              )}
            </Button>
            <Button
              as={Link}
              to={courseId ? `/enroll/${courseId}` : '/courses'}
              variant="ghost"
              size="md"
              disabled={loading}
            >
              Edit enrollment
            </Button>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}