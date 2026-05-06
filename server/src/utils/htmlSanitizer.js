import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = ['b', 'i', 'em', 'p', 'ul', 'li', 'br', 'strong', 'a'];
const ALLOWED_ATTRIBUTES = {
  a: ['href', 'target', 'rel'],
};
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

export function sanitizeRichHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    enforceHtmlBoundary: true,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  }).trim();
}
