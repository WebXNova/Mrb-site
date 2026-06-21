import StarRating from './StarRating';
import { formatReviewDate, getInitials } from './testimonialUtils';
import './ReviewCard.css';

export default function ReviewCard({ review, variant = 'grid', style }) {
  if (!review) return null;

  const dateLabel = formatReviewDate(review.publishedAt || review.createdAt);

  return (
    <article
      className={`review-card review-card--${variant}`}
      style={style}
      itemScope
      itemType="https://schema.org/Review"
    >
      <div className="review-card__top">
        <div className="review-card__avatar" aria-hidden="true">
          {getInitials(review.name)}
        </div>
        <div className="review-card__meta">
          <StarRating rating={review.rating} size={variant === 'carousel' ? 'lg' : 'md'} />
          {review.featured ? (
            <span className="review-card__featured-badge">Featured</span>
          ) : null}
        </div>
      </div>

      <blockquote className="review-card__quote">
        <p itemProp="reviewBody">&ldquo;{review.reviewMessage}&rdquo;</p>
      </blockquote>

      <footer className="review-card__footer">
        <cite className="review-card__author" itemProp="author" itemScope itemType="https://schema.org/Person">
          <span itemProp="name">— {review.name}</span>
        </cite>
        {review.courseName ? (
          <span className="review-card__course">{review.courseName}</span>
        ) : null}
        {dateLabel ? <time className="review-card__date" dateTime={review.publishedAt || review.createdAt}>{dateLabel}</time> : null}
      </footer>

      <meta itemProp="reviewRating" content={String(review.rating)} />
    </article>
  );
}
