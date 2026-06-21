import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from '../../hooks/useInView';
import { publicReviewsApi } from '../../api/publicReviewsApi';
import ReviewCard from './ReviewCard';
import './FeaturedReviewsCarousel.css';

const AUTO_MS = 6000;

function ChevronIcon({ direction = 'left' }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FeaturedReviewsCarousel() {
  const [sectionRef, inView] = useInView({ threshold: 0.15 });
  const [reviews, setReviews] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [phase, setPhase] = useState('enter');
  const timerRef = useRef(null);
  const transitionRef = useRef(null);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    publicReviewsApi
      .list({ featured: true, limit: 12, page: 1 })
      .then((data) => {
        if (cancelled) return;
        setReviews(data?.items || []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setReviews([]);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inView]);

  const count = reviews.length;

  const goTo = useCallback(
    (nextIndex) => {
      if (count <= 1) return;
      const normalized = ((nextIndex % count) + count) % count;
      if (normalized === activeIndex) return;
      setPhase('exit');
      window.clearTimeout(transitionRef.current);
      transitionRef.current = window.setTimeout(() => {
        setActiveIndex(normalized);
        setPhase('enter');
      }, 280);
    },
    [activeIndex, count]
  );

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  useEffect(() => {
    if (!inView || isPaused || count <= 1) return undefined;
    timerRef.current = window.setInterval(goNext, AUTO_MS);
    return () => window.clearInterval(timerRef.current);
  }, [inView, isPaused, goNext, count]);

  useEffect(
    () => () => {
      window.clearInterval(timerRef.current);
      window.clearTimeout(transitionRef.current);
    },
    []
  );

  if (loaded && !reviews.length) return null;

  const active = reviews[activeIndex];

  return (
    <section
      ref={sectionRef}
      className="section featured-reviews"
      aria-labelledby="featured-reviews-heading"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <div className="container featured-reviews__inner">
        <div className="featured-reviews__head">
          <span className="eyebrow">Student Success Stories</span>
          <h2 id="featured-reviews-heading" className="heading-1 text-balance">
            Real results from real students
          </h2>
          <p className="body-lg text-pretty featured-reviews__lead">
            Featured reviews from students who transformed their preparation with MRB Classes.
          </p>
        </div>

        <div className="featured-reviews__stage">
          {!loaded ? (
            <div className="featured-reviews__skeleton" aria-hidden="true">
              <div className="featured-reviews__skeleton-card" />
            </div>
          ) : (
            <>
              <div className={`featured-reviews__slide featured-reviews__slide--${phase}`}>
                <ReviewCard review={active} variant="carousel" />
              </div>

              {count > 1 ? (
                <>
                  <div className="featured-reviews__controls">
                    <button
                      type="button"
                      className="featured-reviews__nav"
                      aria-label="Previous review"
                      onClick={goPrev}
                    >
                      <ChevronIcon direction="left" />
                    </button>
                    <button
                      type="button"
                      className="featured-reviews__nav"
                      aria-label="Next review"
                      onClick={goNext}
                    >
                      <ChevronIcon direction="right" />
                    </button>
                  </div>

                  <div className="featured-reviews__dots" role="tablist" aria-label="Featured reviews">
                    {reviews.map((review, index) => (
                      <button
                        key={review.uuid || review.id}
                        type="button"
                        role="tab"
                        aria-selected={index === activeIndex}
                        aria-label={`Show review ${index + 1} of ${count}`}
                        className={`featured-reviews__dot ${index === activeIndex ? 'featured-reviews__dot--active' : ''}`}
                        onClick={() => goTo(index)}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
