import { Link, useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import './EnrollmentPage.css';

export default function EnrollmentPaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('order_id') || '';
  const enrollmentId = searchParams.get('enrollmentId') || searchParams.get('enrollment_id') || '';

  return (
    <PageLayout>
      <section className="enrollment-shell">
        <div className="enrollment-card enrollment-payment-next">
          <header className="enrollment-header">
            <p className="enrollment-step">Payment</p>
            <h1 className="heading-2">Payment successful!</h1>
            <p className="enrollment-subtitle">
              Your enrollment is being processed. Course access will be available shortly after payment verification.
            </p>
          </header>

          {(orderId || enrollmentId) && (
            <div className="enrollment-payment-next__summary">
              {orderId ? (
                <p>
                  <strong>Order ID:</strong> {orderId}
                </p>
              ) : null}
              {enrollmentId ? (
                <p>
                  <strong>Enrollment ID:</strong> {enrollmentId}
                </p>
              ) : null}
            </div>
          )}

          <article className="enrollment-payment-next__notice">
            Access is granted by our payment system automatically — not from this page. If your course does not appear within a few minutes, contact support.
          </article>

          <div className="enrollment-actions">
            <Button as={Link} to="/dashboard" variant="accent" size="md">
              Go to Student Portal
            </Button>
            <Button as={Link} to="/courses" variant="secondary" size="md">
              Browse courses
            </Button>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
