import PageLayout from '../components/layout/PageLayout';

export default function TermsPage() {
  return (
    <PageLayout>
      <section className="section">
        <div className="container container-narrow">
          <h1 className="heading-1">Terms of Service</h1>
          <p className="body-md" style={{ marginTop: '1rem' }}>
            By using MRB Classes, students agree to acceptable platform usage and exam integrity rules.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
