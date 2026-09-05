import { resolveCourseThumbnailUrl } from '../utils/mediaUrl';

const THUMBNAIL_FIELDS = [
  'thumbnail_url',
  'thumbnailUrl',
  'thumbnail',
  'image',
  'cover_image',
  'coverImage',
  'imageUrl',
  'image_url',
];

function isUsableUrl(value) {
  if (value == null) return false;
  const text = String(value).trim();
  if (!text) return false;
  const lowered = text.toLowerCase();
  return lowered !== 'null' && lowered !== 'undefined';
}

/** First non-empty thumbnail field, resolved for <img src>. */
export function pickCourseThumbnailUrl(course) {
  if (!course || typeof course !== 'object') return '';
  for (const field of THUMBNAIL_FIELDS) {
    const raw = course[field];
    if (!isUsableUrl(raw)) continue;
    return resolveCourseThumbnailUrl(raw);
  }
  return '';
}

export function getCourseTitleInitials(title) {
  const initials = String(title || 'C')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
  return initials || 'C';
}
