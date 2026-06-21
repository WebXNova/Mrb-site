import './StarRating.css';

export default function StarRating({ rating = 0, max = 5, size = 'md', label }) {
  const value = Math.max(0, Math.min(max, Number(rating) || 0));
  const aria = label || `${value} out of ${max} stars`;

  return (
    <span
      className={`star-rating star-rating--${size}`}
      role="img"
      aria-label={aria}
    >
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'star-rating__star star-rating__star--filled' : 'star-rating__star'}>
          ★
        </span>
      ))}
    </span>
  );
}
