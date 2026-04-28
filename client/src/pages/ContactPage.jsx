import PageLayout from '../components/layout/PageLayout';

export default function ContactPage() {
  return (
    <PageLayout>
      <section className="section">
        <div className="container container-narrow">
          <span className="eyebrow">Contact</span>
          <h1 className="heading-1 text-balance" style={{ marginTop: '1rem' }}>
            We’ll get back to you within a working day.
          </h1>
          <p className="body-lg text-pretty" style={{ marginTop: '1.5rem' }}>
            For MRB-code activation issues, billing, or general queries, write to us
            at{' '}
            <a
              href="mailto:hello@mrblearning.example"
              style={{ color: 'var(--color-primary)', fontWeight: 600 }}
            >
              hello@mrblearning.example
            </a>
            .
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
