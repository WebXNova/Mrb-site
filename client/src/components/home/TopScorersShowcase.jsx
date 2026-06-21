import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { mdcatToppers, TOPPER_ROTATION_MS } from '../../data/mdcatToppers';
import PostedRemarksShowcase from './PostedRemarksShowcase';
import './TopScorersShowcase.css';

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 10h12M11 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useCarousel(slides, rotationMs) {
  const count = slides.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [slidePhase, setSlidePhase] = useState('enter');
  const timerRef = useRef(null);
  const transitionRef = useRef(null);

  useEffect(() => {
    setActiveIndex(0);
    setSlidePhase('enter');
  }, [count]);

  const goTo = useCallback(
    (nextIndex) => {
      if (nextIndex === activeIndex || count === 0) return;
      setSlidePhase('exit');
      window.clearTimeout(transitionRef.current);
      transitionRef.current = window.setTimeout(() => {
        setActiveIndex(((nextIndex % count) + count) % count);
        setSlidePhase('enter');
      }, 320);
    },
    [activeIndex, count]
  );

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);

  useEffect(() => {
    if (isPaused || count <= 1) return undefined;
    timerRef.current = window.setInterval(goNext, rotationMs);
    return () => window.clearInterval(timerRef.current);
  }, [isPaused, goNext, count, rotationMs]);

  useEffect(
    () => () => {
      window.clearInterval(timerRef.current);
      window.clearTimeout(transitionRef.current);
    },
    []
  );

  return { count, activeIndex, slidePhase, isPaused, setIsPaused, goTo };
}

function CarouselControls({ count, activeIndex, onGoTo, labelPrefix }) {
  if (count <= 1) return null;
  return (
    <>
      <div className="top-scorers__dots" role="tablist" aria-label={labelPrefix}>
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            className={`top-scorers__dot ${index === activeIndex ? 'top-scorers__dot--active' : ''}`}
            aria-selected={index === activeIndex}
            aria-label={`View ${labelPrefix} ${index + 1} of ${count}`}
            onClick={() => onGoTo(index)}
          />
        ))}
      </div>
      <p className="top-scorers__counter" aria-hidden="true">
        {String(activeIndex + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
      </p>
    </>
  );
}

export default function TopScorersShowcase() {
  const topperCarousel = useCarousel(mdcatToppers, TOPPER_ROTATION_MS);

  return (
    <section className="section top-scorers" aria-labelledby="top-scorers-heading">
      <div className="container success-stories">
        {/* MDCAT topper images first */}
        <div className="success-stories__toppers">
          <div className="top-scorers__inner">
            <div className="top-scorers__content">
              <span className="eyebrow top-scorers__eyebrow">MDCAT Success Stories</span>
              <h2 id="top-scorers-heading" className="heading-1 text-balance top-scorers__title">
                Our Top Qualifier of MDCAT 2025
              </h2>
              <p className="body-lg text-pretty top-scorers__lead">
                Every year, 100+ students secure admission to medical and dental colleges across Pakistan.
              </p>
              <Button
                as={Link}
                to="/register"
                variant="outline"
                size="lg"
                className="top-scorers__cta"
                trailingIcon={<ArrowIcon />}
              >
                Be the Next Topper
              </Button>
            </div>

            <div
              className="top-scorers__showcase"
              onMouseEnter={() => topperCarousel.setIsPaused(true)}
              onMouseLeave={() => topperCarousel.setIsPaused(false)}
            >
              <div className="top-scorers__frame" aria-live="polite">
                <div className="top-scorers__frame-glow" aria-hidden="true" />
                <div className="top-scorers__slides">
                  {mdcatToppers.map((topper, index) => {
                    const isActive = index === topperCarousel.activeIndex;
                    return (
                      <figure
                        key={topper.id}
                        className={[
                          'top-scorers__slide',
                          isActive ? 'top-scorers__slide--active' : '',
                          isActive && topperCarousel.slidePhase === 'exit' ? 'top-scorers__slide--exit' : '',
                          isActive && topperCarousel.slidePhase === 'enter' ? 'top-scorers__slide--enter' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-hidden={!isActive}
                      >
                        <img
                          src={topper.src}
                          alt={isActive ? topper.alt : ''}
                          className="top-scorers__image"
                          loading={index === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                          draggable={false}
                        />
                      </figure>
                    );
                  })}
                </div>
              </div>
              <CarouselControls
                count={topperCarousel.count}
                activeIndex={topperCarousel.activeIndex}
                onGoTo={topperCarousel.goTo}
                labelPrefix="MDCAT topper"
              />
            </div>
          </div>
        </div>

        {/* Admin-posted remarks — after images */}
        <PostedRemarksShowcase />
      </div>
    </section>
  );
}
