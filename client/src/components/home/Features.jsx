import { features } from '../../data/stats';
import './Features.css';

const icons = {
  play: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4z" />
      <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};

export default function Features() {
  return (
    <section className="section features">
      <div className="container">
        <div className="features__head">
          <span className="eyebrow">Why MRB Classes</span>
          <h2 className="heading-1 text-balance">
            Built for the way you actually study.
          </h2>
          <p className="body-lg text-pretty">
            Every screen, every test, every answer — designed to keep you focused on
            what matters.
          </p>
        </div>

        <div className="features__grid">
          {features.map((feature, index) => (
            <article key={feature.id} className="feature-card" style={{ '--i': index }}>
              <div className="feature-card__icon">{icons[feature.icon]}</div>
              <h3 className="feature-card__title">{feature.title}</h3>
              <p className="feature-card__desc">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
