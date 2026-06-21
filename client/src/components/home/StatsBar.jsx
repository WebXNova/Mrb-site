import { useEffect, useMemo, useRef, useState } from 'react';
import { platformStats } from '../../data/stats';
import './StatsBar.css';

export default function StatsBar() {
  const stats = useMemo(() => platformStats.map(parseStatValue), []);
  const [displayValues, setDisplayValues] = useState(() =>
    stats.map((stat) => (isAnimatedStat(stat) ? formatAnimatedValue(0, stat) : stat.value))
  );
  const [fadeInTime, setFadeInTime] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animateStats = () => {
      if (prefersReducedMotion) {
        setDisplayValues(stats.map((stat) => stat.value));
        setFadeInTime(true);
        return;
      }

      const duration = 1800;
      const start = performance.now();

      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        setDisplayValues(
          stats.map((stat) => {
            if (!isAnimatedStat(stat)) return stat.value;
            const current = Math.round(stat.target * eased);
            return formatAnimatedValue(current, stat);
          })
        );
        setFadeInTime(progress > 0.5);

        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };

      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        animateStats();
        observer.disconnect();
      },
      { threshold: 0.35 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [stats]);

  return (
    <section className="stats-bar" ref={sectionRef}>
      <div className="container">
        <div className="stats-bar__grid">
          {stats.map((stat, index) => (
            <div key={stat.label} className="stats-bar__item">
              <span
                className="stats-bar__value"
                style={
                  stat.type === 'ratio'
                    ? {
                        opacity: fadeInTime ? 1 : 0.85,
                        transition: 'opacity 420ms ease-out',
                      }
                    : undefined
                }
              >
                {displayValues[index]}
              </span>
              <span className="stats-bar__label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function parseStatValue(stat) {
  const value = stat.value.trim();

  if (/^\d+[K]\+$/.test(value)) {
    return {
      ...stat,
      type: 'count',
      target: Number.parseInt(value, 10),
      suffix: 'K+',
    };
  }

  if (/^\d+\+$/.test(value)) {
    return {
      ...stat,
      type: 'count',
      target: Number.parseInt(value, 10),
      suffix: '+',
    };
  }

  if (/^\d+\/\d+$/.test(value)) {
    const [hours, days] = value.split('/');
    return {
      ...stat,
      type: 'ratio',
      target: Number.parseInt(hours, 10),
      suffix: `/${days}`,
    };
  }

  return {
    ...stat,
    type: 'static',
  };
}

function isAnimatedStat(stat) {
  return stat.type === 'count' || stat.type === 'ratio';
}

function formatAnimatedValue(number, stat) {
  if (stat.type === 'ratio') {
    return number >= stat.target ? `${stat.target}${stat.suffix}` : String(number);
  }
  return `${number}${stat.suffix}`;
}
