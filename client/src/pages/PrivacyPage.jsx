import PageLayout from '../components/layout/PageLayout';

export default function PrivacyPage() {
  return (
    <PageLayout>
      <section className="section">
        <div className="container container-narrow">
          <h1 className="heading-1">Privacy Policy</h1>
          <p className="body-md" style={{ marginTop: '1rem' }}>
            MRB Learning stores only required account and learning data. Detailed legal text will be finalized with backend and compliance setup.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
