import { useEffect, useMemo, useRef, useState } from 'react';
import { useInView } from '../../hooks/useInView';
import { publicReviewsApi } from '../../api/publicReviewsApi';
import './TestimonialSocialProof.css';

const FALLBACK_STATS = [
  { key: 'students', label: 'Students', value: '5,000+' },
  { key: 'tests', label: 'Tests Conducted', value: '1,000+' },
  { key: 'satisfaction', label: 'Student Satisfaction', value: '95%' },
];

function animateCount(target, formatter, duration, onUpdate) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    onUpdate(formatter(target));
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    onUpdate(formatter(Math.round(target * eased)));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function TestimonialSocialProof() {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const [stats, setStats] = useState(null);
  const [display, setDisplay] = useState(FALLBACK_STATS.map((s) => s.value));
  const animated = useRef(false);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    publicReviewsApi
      .platformStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inView]);

  const items = useMemo(() => {
    if (!stats?.display) return FALLBACK_STATS;
    return [
      { key: 'students', label: 'Students', value: stats.display.students },
      { key: 'tests', label: 'Tests Conducted', value: stats.display.tests },
      { key: 'satisfaction', label: 'Student Satisfaction', value: stats.display.satisfaction },
    ];
  }, [stats]);

  useEffect(() => {
    if (!inView || animated.current) return;
    animated.current = true;

    items.forEach((item, index) => {
      if (item.key === 'satisfaction') {
        const num = parseInt(String(item.value), 10);
        if (Number.isFinite(num)) {
          animateCount(num, (n) => `${n}%`, 1400, (val) => {
            setDisplay((prev) => {
              const next = [...prev];
              next[index] = val;
              return next;
            });
          });
        } else {
          setDisplay((prev) => {
            const next = [...prev];
            next[index] = item.value;
            return next;
          });
        }
        return;
      }

      const match = String(item.value).match(/^([\d,]+)\+?$/);
      if (match) {
        const target = Number(match[1].replace(/,/g, ''));
        animateCount(target, (n) => `${n.toLocaleString('en-US')}+`, 1600, (val) => {
          setDisplay((prev) => {
            const next = [...prev];
            next[index] = val;
            return next;
          });
        });
      } else {
        setDisplay((prev) => {
          const next = [...prev];
          next[index] = item.value;
          return next;
        });
      }
    });
  }, [inView, items]);

  return (
    <div ref={ref} className="testimonial-social-proof">
      {items.map((item, index) => (
        <div key={item.key} className="testimonial-social-proof__item">
          <span className="testimonial-social-proof__value">{display[index]}</span>
          <span className="testimonial-social-proof__label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
