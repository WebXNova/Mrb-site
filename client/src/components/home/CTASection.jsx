import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import './CTASection.css';

export default function CTASection() {
  return (
    <section className="section-tight cta-section">
      <div className="container">
        <div className="cta-card">
          <div className="cta-card__content">
            <span className="eyebrow cta-card__eyebrow">Ready when you are</span>
            <h2 className="heading-1 text-balance">
              Stop scrolling. Start studying.
            </h2>
            <p className="body-lg text-pretty cta-card__lead">
              Create your account, set up your profile, and open your first lecture in
              under two minutes.
            </p>
            <div className="cta-card__actions">
              <Button as={Link} to="/register" variant="accent" size="lg">
                Start learning now
              </Button>
              <Button as={Link} to="/contact" variant="ghost" size="lg">
                Talk to us
              </Button>
            </div>
          </div>

          <div className="cta-card__visual" aria-hidden="true">
            <div className="cta-card__shape cta-card__shape--1" />
            <div className="cta-card__shape cta-card__shape--2" />
            <div className="cta-card__shape cta-card__shape--3" />
          </div>
        </div>
      </div>
    </section>
  );
}
