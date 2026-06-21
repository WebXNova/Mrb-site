import { features } from '../../data/stats';
import { useInView } from '../../hooks/useInView';
import './Features.css';

const icons = {
  play: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4z" />
      <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};

export default function Features() {
  const [sectionRef, inView] = useInView({ threshold: 0.12 });

  return (
    <section
      ref={sectionRef}
      className={`section features ${inView ? 'features--visible' : ''}`}
      aria-labelledby="features-heading"
    >
      <div className="features__bg" aria-hidden="true">
        <div className="features__orb features__orb--red" />
        <div className="features__orb features__orb--blue" />
        <div className="features__orb features__orb--blend" />
      </div>

      <div className="container features__inner">
        <header className="features__head">
          <span className="features__eyebrow">Why MRB Classes</span>
          <h2 id="features-heading" className="features__title">
            Built for the way you{' '}
            <span className="features__keyword features__keyword--red">actually</span>{' '}
            <span className="features__keyword-wrap">
              <span className="features__keyword features__keyword--blue">study</span>
              <span className="features__title-underline" aria-hidden="true" />
            </span>
            .
          </h2>
          <p className="features__lead">
            Every screen, every test, every answer — designed to keep you focused on
            what matters.
          </p>
        </header>

        <div className="features__grid">
          {features.map((feature, index) => (
            <article
              key={feature.id}
              className="feature-card"
              style={{ '--delay': `${index * 100}ms` }}
              tabIndex={0}
            >
              <span className="feature-card__accent" aria-hidden="true" />
              <div className="feature-card__icon-wrap">
                <span className="feature-card__icon-glow" aria-hidden="true" />
                <div className="feature-card__icon">{icons[feature.icon]}</div>
              </div>
              <h3 className="feature-card__title">{feature.title}</h3>
              <p className="feature-card__desc">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
