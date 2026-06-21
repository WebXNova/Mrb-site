export function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatReviewDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function buildReviewsJsonLd(reviews, stats) {
  if (!reviews?.length) return null;

  const ratings = reviews.map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
  const avg =
    stats?.avgRating ??
    (ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null);

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://mrbclasses.com/#organization',
        name: 'MRB Classes',
        aggregateRating: avg
          ? {
              '@type': 'AggregateRating',
              ratingValue: String(Math.round(avg * 10) / 10),
              bestRating: '5',
              worstRating: '1',
              ratingCount: String(stats?.reviewCount ?? reviews.length),
            }
          : undefined,
      },
      ...reviews.slice(0, 12).map((review) => ({
        '@type': 'Review',
        author: {
          '@type': 'Person',
          name: review.name,
        },
        reviewRating: {
          '@type': 'Rating',
          ratingValue: String(review.rating),
          bestRating: '5',
          worstRating: '1',
        },
        reviewBody: review.reviewMessage,
        datePublished: review.publishedAt || review.createdAt,
        itemReviewed: {
          '@type': 'Course',
          name: review.courseName || 'MRB Classes Online Course',
          provider: { '@id': 'https://mrbclasses.com/#organization' },
        },
      })),
    ],
  };

  return graph;
}
