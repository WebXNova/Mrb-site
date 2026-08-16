import { ApiError } from '../utils/apiError.js';

/**
 * Parse optional `category_id` from public catalog list query string.
 * @param {import('express').Request['query']} query
 * @returns {number|null}
 */
export function parsePublicCatalogCategoryId(query) {
  const raw = query?.category_id;
  if (raw == null || raw === '') return null;
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid category_id query parameter', { code: 'INVALID_CATEGORY_ID' });
  }
  return id;
}

/**
 * Future-ready multi-filter parser (not wired to route yet).
 * @param {import('express').Request['query']} query
 * @returns {number[]}
 */
export function parsePublicCatalogCategoryIds(query) {
  const raw = query?.category_ids;
  if (raw == null || raw === '') return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(',');
  const ids = parts
    .map((v) => Number(String(v).trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length && String(raw).trim() !== '') {
    throw new ApiError(400, 'Invalid category_ids query parameter', { code: 'INVALID_CATEGORY_IDS' });
  }
  return [...new Set(ids)];
}
