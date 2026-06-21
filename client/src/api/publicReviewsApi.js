import { getApiBaseUrl } from './runtimeConfig';

const CACHE_TTL_MS = 5 * 60 * 1000;
const memoryCache = new Map();

async function cachedFetch(key, fetcher) {
  const hit = memoryCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }
  const data = await fetcher();
  memoryCache.set(key, { at: Date.now(), data });
  return data;
}

function buildQuery(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    sp.set(key, String(value));
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

async function publicGet(path) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const message = body?.error?.message || response.statusText || 'Request failed';
    throw new Error(message);
  }
  return body?.data ?? body;
}

export const publicReviewsApi = {
  platformStats() {
    return cachedFetch('reviews:platform-stats', () => publicGet('/reviews/platform-stats'));
  },

  list({ page = 1, limit = 9, featured = false } = {}) {
    const key = `reviews:list:${page}:${limit}:${featured}`;
    return cachedFetch(key, () =>
      publicGet(`/reviews${buildQuery({ page, limit, featured: featured ? 'true' : undefined })}`)
    );
  },
};
