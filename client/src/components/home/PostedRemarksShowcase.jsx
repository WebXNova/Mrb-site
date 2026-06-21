import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from '../../hooks/useInView';
import { usePostedRemarks } from './usePostedRemarks';
import PostedRemarkQuote from './PostedRemarkQuote';
import './PostedRemarksShowcase.css';

const AUTO_MS = 6000;

function Chevron({ dir = 'left' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PostedRemarksShowcase() {
  const [sectionRef, inView] = useInView({ threshold: 0.12 });
  const { remarks, loading } = usePostedRemarks();
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState('enter');
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const transitionRef = useRef(null);
  const count = remarks.length;

  const goTo = useCallback(
    (next) => {
      if (count <= 1 || next === active) return;
      setPhase('exit');
      window.clearTimeout(transitionRef.current);
      transitionRef.current = window.setTimeout(() => {
        setActive(((next % count) + count) % count);
        setPhase('enter');
      }, 380);
    },
    [active, count]
  );

  const goNext = useCallback(() => goTo(active + 1), [active, goTo]);
  const goPrev = useCallback(() => goTo(active - 1), [active, goTo]);

  useEffect(() => {
    setActive(0);
    setPhase('enter');
  }, [count]);

  useEffect(() => {
    if (!inView || paused || count <= 1) return undefined;
    timerRef.current = window.setInterval(goNext, AUTO_MS);
    return () => window.clearInterval(timerRef.current);
  }, [inView, paused, goNext, count]);

  useEffect(
    () => () => {
      window.clearInterval(timerRef.current);
      window.clearTimeout(transitionRef.current);
    },
    []
  );

  if (!loading && count === 0) return null;

  return (
    <div
      ref={sectionRef}
      className={`vip-remarks ${inView ? 'vip-remarks--visible' : ''}`}
      aria-labelledby="vip-remarks-heading"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="vip-remarks__head">
        <span className="vip-remarks__eyebrow">What Our Students Say</span>
        <h2 id="vip-remarks-heading" className="vip-remarks__title">
          Voices of Success
        </h2>
        <p className="vip-remarks__lead">
          Real feedback from students who studied with MRB Classes.
        </p>
      </div>

      {loading ? (
        <div className="vip-remarks__stage vip-remarks__stage--loading" aria-hidden="true">
          <div className="vip-remarks__skeleton" />
        </div>
      ) : (
        <div className="vip-remarks__stage">
          {count > 1 ? (
            <>
              <button
                type="button"
                className="vip-remarks__nav vip-remarks__nav--prev"
                aria-label="Previous remark"
                onClick={goPrev}
              >
                <Chevron dir="left" />
              </button>

              <div className="vip-remarks__track" aria-live="polite">
                {remarks.map((remark, index) => {
                  const isActive = index === active;
                  return (
                    <div
                      key={remark.id}
                      className={[
                        'vip-remarks__slide',
                        isActive ? 'vip-remarks__slide--active' : '',
                        isActive && phase === 'exit' ? 'vip-remarks__slide--exit' : '',
                        isActive && phase === 'enter' ? 'vip-remarks__slide--enter' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden={!isActive}
                    >
                      <PostedRemarkQuote remark={remark} variant="hero" />
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="vip-remarks__nav vip-remarks__nav--next"
                aria-label="Next remark"
                onClick={goNext}
              >
                <Chevron dir="right" />
              </button>
            </>
          ) : (
            <div className="vip-remarks__single">
              <PostedRemarkQuote remark={remarks[0]} variant="hero" />
            </div>
          )}

          {count > 1 ? (
            <div className="vip-remarks__footer">
              <div className="vip-remarks__dots" role="tablist" aria-label="Student remarks">
                {remarks.map((remark, index) => (
                  <button
                    key={remark.id}
                    type="button"
                    role="tab"
                    className={`vip-remarks__dot ${index === active ? 'vip-remarks__dot--active' : ''}`}
                    aria-selected={index === active}
                    aria-label={`Remark ${index + 1} of ${count}`}
                    onClick={() => goTo(index)}
                  />
                ))}
              </div>
              <p className="vip-remarks__counter" aria-hidden="true">
                {String(active + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
