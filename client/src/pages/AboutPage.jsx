import PageLayout from '../components/layout/PageLayout';

export default function AboutPage() {
  return (
    <PageLayout>
      <section className="section">
        <div className="container container-narrow">
          <span className="eyebrow">About MRB</span>
          <h1 className="heading-1 text-balance" style={{ marginTop: '1rem' }}>
            A focused classroom for serious students.
          </h1>
          <p className="body-lg text-pretty" style={{ marginTop: '1.5rem' }}>
            MRB Classes is built around one idea — students do their best work in a
            calm, distraction-free environment. We give MRB students structured
            lectures, a test engine that explains every answer, and direct access to
            their teachers for doubts.
          </p>
          <p className="body-md text-pretty" style={{ marginTop: '1.5rem' }}>
            No public chats, no spam accounts, no engagement tricks. Just lectures,
            tests, and answers — laid out clearly so you always know what to do next.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
