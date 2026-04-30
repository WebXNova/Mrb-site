import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import './Hero.css';

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__content">
          <span className="hero__pill">
            <span className="hero__pill-dot" />
            For serious MRB students
          </span>

          <h1 className="hero__title heading-display text-balance">
            Where An Average Students
            <br />
            Become <span className="hero__highlight">Toppers</span>.
          </h1>

          <p className="hero__lead body-lg text-pretty">
            Structured lectures, a test engine that actually teaches, and manual admin
            answers — all in one calm, focused dashboard for your MRB journey.
          </p>

          <div className="hero__actions">
            <Button as={Link} to="/register" variant="primary" size="lg">
              Start learning
            </Button>
            <Button as={Link} to="/courses" variant="secondary" size="lg">
              Browse courses
            </Button>
          </div>

          <ul className="hero__bullets">
            <li>
              <CheckIcon /> Verified MRB-code access
            </li>
            <li>
              <CheckIcon /> Subject-tagged doubt support
            </li>
            <li>
              <CheckIcon /> Tests with real explanations
            </li>
          </ul>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="hero__card hero__card--main">
            <div className="hero__card-header">
              <span className="hero__chip hero__chip--physics">Physics</span>
              <span className="hero__time">Today, 6:42 PM</span>
            </div>
            <div className="hero__card-question">
              How does Lenz's law explain the direction of induced current?
            </div>
            <div className="hero__card-status">
              <span className="hero__dot hero__dot--green" />
              Answered by MRB Admin Support
            </div>
            <div className="hero__card-answer">
              "The induced current always flows in a direction that opposes the change
              in magnetic flux causing it..."
            </div>
          </div>

          <div className="hero__card hero__card--metric hero__card--metric-1">
            <span className="hero__metric-label">Avg. Test Score</span>
            <span className="hero__metric-value">82%</span>
            <span className="hero__metric-trend">+12% this month</span>
          </div>

          <div className="hero__card hero__card--metric hero__card--metric-2">
            <span className="hero__metric-label">Lectures Watched</span>
            <span className="hero__metric-value">24</span>
            <span className="hero__metric-bar">
              <span className="hero__metric-bar-fill" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="var(--color-primary-50)" />
      <path
        d="M6 10l2.5 2.5L14 7"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
