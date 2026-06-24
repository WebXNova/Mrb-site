import { Link, useLocation } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import './EnrollmentPage.css';

export default function EnrollmentPaymentFailedPage() {
  const location = useLocation();
  const enrollmentId = location.state?.enrollmentId ?? null;
  const courseId = location.state?.courseId ?? null;

  const retryState = {
    enrollmentId,
    orderId: location.state?.orderId ?? null,
    courseId,
  };

  return (
    <PageLayout>
      <section className="enrollment-shell">
        <div className="enrollment-card enrollment-payment-next">
          <header className="enrollment-header">
            <p className="enrollment-step">Payment</p>
            <h1 className="heading-2">Payment was not completed</h1>
            <p className="enrollment-subtitle">
              Your payment was cancelled or could not be processed. You can try again or contact support if you were charged.
            </p>
          </header>

          <div className="enrollment-actions">
            <Button as={Link} to="/enrollment/payment" state={retryState} variant="accent" size="md">
              Try again
            </Button>
            <Button as={Link} to="/contact" variant="secondary" size="md">
              Contact support
            </Button>
            <Button as={Link} to="/courses" variant="ghost" size="md">
              Back to courses
            </Button>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
