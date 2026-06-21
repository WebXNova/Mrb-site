import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useInView } from '../../hooks/useInView';
import { publicReviewsApi } from '../../api/publicReviewsApi';
import TestimonialSocialProof from './TestimonialSocialProof';
import ReviewCard from './ReviewCard';
import { buildReviewsJsonLd } from './testimonialUtils';
import './TestimonialsSection.css';

const PAGE_SIZE = 9;

function TestimonialsGridSkeleton() {
  return (
    <div className="testimonials-grid testimonials-grid--loading" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="testimonials-grid__skeleton" />
      ))}
    </div>
  );
}

export default function TestimonialsSection() {
  const [sectionRef, inView] = useInView({ threshold: 0.08 });
  const [reviews, setReviews] = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [visible, setVisible] = useState(false);

  const loadPage = useCallback(async (pageNum, append = false) => {
    setLoading(true);
    try {
      const data = await publicReviewsApi.list({ page: pageNum, limit: PAGE_SIZE });
      const items = data?.items || [];
      setReviews((prev) => (append ? [...prev, ...items] : items));
      setTotalPages(data?.totalPages || 0);
      setPage(pageNum);
      if (!append && items.length === 0) {
        setVisible(false);
      } else {
        setVisible(true);
      }
    } catch {
      if (!append) setVisible(false);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!inView || initialLoaded) return;
    loadPage(1, false);
    publicReviewsApi.platformStats().then(setPlatformStats).catch(() => {});
  }, [inView, initialLoaded, loadPage]);

  const jsonLd = useMemo(
    () => buildReviewsJsonLd(reviews, platformStats),
    [reviews, platformStats]
  );

  const hasMore = page < totalPages;

  async function handleLoadMore() {
    if (loading || !hasMore) return;
    await loadPage(page + 1, true);
  }

  if (initialLoaded && !visible) return null;

  return (
    <section
      ref={sectionRef}
      className={`section testimonials-section ${inView ? 'testimonials-section--visible' : ''}`}
      aria-labelledby="testimonials-heading"
    >
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <div className="container">
        <TestimonialSocialProof />

        <div className="testimonials-section__head">
          <span className="eyebrow">Student Reviews</span>
          <h2 id="testimonials-heading" className="heading-1 text-balance">
            ⭐ What Our Students Say
          </h2>
          <p className="body-lg text-pretty testimonials-section__subtitle">
            Real feedback from students who studied with MRB Classes.
          </p>
        </div>

        {!initialLoaded ? (
          <TestimonialsGridSkeleton />
        ) : (
          <>
            <div className="testimonials-grid">
              {reviews.map((review, index) => (
                <ReviewCard
                  key={review.uuid || review.id}
                  review={review}
                  style={{ '--i': index }}
                />
              ))}
            </div>

            {hasMore ? (
              <div className="testimonials-section__more">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={loading}
                  onClick={handleLoadMore}
                >
                  {loading ? 'Loading…' : 'Load more reviews'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/** Lazy-load fallback skeleton */
export function TestimonialsSectionFallback() {
  return (
    <section className="section testimonials-section">
      <div className="container">
        <TestimonialsGridSkeleton />
      </div>
    </section>
  );
}
