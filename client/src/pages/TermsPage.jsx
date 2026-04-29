import PageLayout from '../components/layout/PageLayout';

export default function TermsPage() {
  return (
    <PageLayout>
      <section className="section">
        <div className="container container-narrow">
          <h1 className="heading-1">Terms of Service</h1>
          <p className="body-md" style={{ marginTop: '1rem' }}>
            By using MRB Learning, students agree to acceptable platform usage, exam integrity rules, and code-based access limits.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
