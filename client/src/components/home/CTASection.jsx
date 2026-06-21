import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from '../../hooks/useInView';
import './CTASection.css';

const HEADLINE_WORDS = ['Stop', 'scrolling.', 'Start', 'studying.'];

const STATS = [
  { target: 12000, suffix: '+', label: 'Students' },
  { target: 500, suffix: '+', label: 'MDCAT Mock Tests' },
  { target: 95, suffix: '%', label: 'Satisfaction' },
];

function formatStatValue(value, stat) {
  const num = value >= 1000 ? value.toLocaleString('en-US') : String(value);
  return `${num}${stat.suffix}`;
}

const FLOATING_CARDS = [
  {
    id: 'physics',
    label: 'Physics Test',
    value: '48/50 Correct',
    tone: 'red',
    style: { top: '6%', left: '4%', '--float-delay': '0s', '--float-rotate': '-7deg' },
  },
  {
    id: 'biology',
    label: 'Biology Quiz',
    value: '95%',
    tone: 'blue',
    style: { top: '28%', right: '2%', '--float-delay': '-2s', '--float-rotate': '5deg' },
  },
  {
    id: 'chemistry',
    label: 'Chemistry Practice',
    value: 'Completed',
    tone: 'blue',
    style: { bottom: '28%', left: '12%', '--float-delay': '-4s', '--float-rotate': '-3deg' },
  },
  {
    id: 'mdcat',
    label: 'MDCAT Mock',
    value: 'Rank #12',
    tone: 'red',
    style: { bottom: '8%', right: '8%', '--float-delay': '-6s', '--float-rotate': '8deg' },
  },
];

const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${8 + ((i * 17) % 84)}%`,
  top: `${6 + ((i * 23) % 88)}%`,
  size: 2 + (i % 3),
  delay: `${-(i * 1.7)}s`,
  duration: `${14 + (i % 5) * 2}s`,
}));

function MagneticLink({ to, className, children }) {
  const ref = useRef(null);

  const handleMove = useCallback((e) => {
    const node = ref.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = node.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * 0.18;
    const y = (e.clientY - rect.top - rect.height / 2) * 0.18;
    node.style.setProperty('--mag-x', `${x}px`);
    node.style.setProperty('--mag-y', `${y}px`);
  }, []);

  const handleLeave = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--mag-x', '0px');
    node.style.setProperty('--mag-y', '0px');
  }, []);

  return (
    <Link
      ref={ref}
      to={to}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onFocus={handleLeave}
    >
      {children}
    </Link>
  );
}

export default function CTASection() {
  const [sectionRef, inView] = useInView({ threshold: 0.2 });
  const cardRef = useRef(null);
  const rafRef = useRef(null);
  const targetRef = useRef({ x: 0.5, y: 0.5 });
  const currentRef = useRef({ x: 0.5, y: 0.5 });
  const [statValues, setStatValues] = useState(() => STATS.map(() => '0'));

  const handlePointerMove = useCallback((e) => {
    const node = cardRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    targetRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const handlePointerLeave = useCallback(() => {
    targetRef.current = { x: 0.5, y: 0.5 };
  }, []);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      node.style.setProperty('--cursor-x', '0.5');
      node.style.setProperty('--cursor-y', '0.5');
      return undefined;
    }

    const tick = () => {
      const target = targetRef.current;
      const current = currentRef.current;
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;
      node.style.setProperty('--cursor-x', String(current.x));
      node.style.setProperty('--cursor-y', String(current.y));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (!inView) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setStatValues(STATS.map((s) => formatStatValue(s.target, s)));
      return undefined;
    }

    const duration = 2200;
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 4;
      setStatValues(
        STATS.map((stat) => formatStatValue(Math.round(stat.target * eased), stat))
      );
      if (progress < 1) requestAnimationFrame(step);
    };

    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [inView]);

  return (
    <section
      ref={sectionRef}
      className={`section-tight cta-section ${inView ? 'cta-section--visible' : ''}`}
      aria-labelledby="cta-heading"
    >
      <div className="container">
        <div
          ref={cardRef}
          className="cta-card"
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
        >
          <div className="cta-card__bg" aria-hidden="true">
            <div className="cta-card__gradient" />
            <div className="cta-card__grid" />
            <div className="cta-card__glow cta-card__glow--red" />
            <div className="cta-card__glow cta-card__glow--blue" />
            <div className="cta-card__cursor-glow" />
            {PARTICLES.map((p) => (
              <span
                key={p.id}
                className="cta-card__particle"
                style={{
                  left: p.left,
                  top: p.top,
                  width: p.size,
                  height: p.size,
                  animationDelay: p.delay,
                  animationDuration: p.duration,
                }}
              />
            ))}
          </div>

          <div className="cta-card__content">
            <span className="cta-card__eyebrow">Ready when you are</span>

            <h2 id="cta-heading" className="cta-card__headline">
              {HEADLINE_WORDS.map((word, index) => (
                <span
                  key={word}
                  className="cta-card__word"
                  style={{ '--word-i': index }}
                >
                  {word}{' '}
                </span>
              ))}
            </h2>

            <p className="cta-card__lead">
              Create your account, set up your profile, and open your first lecture in
              under two minutes.
            </p>

            <div className="cta-card__stats" aria-label="Platform statistics">
              {STATS.map((stat, index) => (
                <div key={stat.label} className="cta-stat" style={{ '--stat-i': index }}>
                  <span className="cta-stat__value">{statValues[index]}</span>
                  <span className="cta-stat__label">{stat.label}</span>
                </div>
              ))}
            </div>

            <div className="cta-card__actions">
              <MagneticLink to="/register" className="cta-btn cta-btn--primary">
                <span className="cta-btn__ripple" aria-hidden="true" />
                Start learning now
              </MagneticLink>
              <MagneticLink to="/contact" className="cta-btn cta-btn--secondary">
                <span className="cta-btn__ripple" aria-hidden="true" />
                Talk to us
              </MagneticLink>
            </div>
          </div>

          <div className="cta-card__visual" aria-hidden="true">
            {FLOATING_CARDS.map((card, index) => (
              <article
                key={card.id}
                className={`cta-float-card cta-float-card--${card.tone}`}
                style={{ ...card.style, '--card-i': index }}
              >
                <span className="cta-float-card__shine" />
                <span className="cta-float-card__label">{card.label}</span>
                <strong className="cta-float-card__value">{card.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
