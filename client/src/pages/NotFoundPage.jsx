import { Link } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <PageLayout>
      <section className="section">
        <div
          className="container container-narrow"
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            alignItems: 'center',
            paddingBlock: '4rem',
          }}
        >
          <span
            className="heading-display"
            style={{ color: 'var(--color-primary)', fontSize: '6rem' }}
          >
            404
          </span>
          <h1 className="heading-2">This page slipped away.</h1>
          <p className="body-md">
            The page you’re looking for doesn’t exist or has been moved.
          </p>
          <Button as={Link} to="/" variant="primary" size="md">
            Back to home
          </Button>
        </div>
      </section>
    </PageLayout>
  );
}
