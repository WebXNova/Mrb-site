/**
 * Public catalog data access — reusable across catalog page, search, and future category landing pages.
 * Keep fetch/query logic here; UI components consume normalized results only.
 */

import { http } from '../api/http';
import { mapCatalogCourseToCardProps } from './coursePresentation';

/**
 * @typedef {{ id: number, name: string, description?: string|null, display_order?: number }} PublicCourseCategory
 */

/**
 * @returns {Promise<PublicCourseCategory[]>}
 */
export async function fetchPublicCourseCategories() {
  const response = await http.get('/courses/categories', { authScope: null });
  const payload = response?.data;
  if (Array.isArray(payload?.categories)) return payload.categories;
  if (Array.isArray(payload)) return payload;
  return [];
}

/**
 * @param {{ categoryId?: number|null, categoryIds?: number[] }} [filters]
 * @returns {Promise<Array<ReturnType<typeof mapCatalogCourseToCardProps>>>}
 */
export async function fetchPublicCatalogCourses(filters = {}) {
  const params = new URLSearchParams();
  const singleId = filters.categoryId ?? null;
  const multiIds = Array.isArray(filters.categoryIds) ? filters.categoryIds : [];

  if (singleId != null && Number(singleId) > 0) {
    params.set('category_id', String(singleId));
  } else if (multiIds.length === 1) {
    params.set('category_id', String(multiIds[0]));
  }

  const qs = params.toString();
  const response = await http.get(`/courses/public${qs ? `?${qs}` : ''}`, { authScope: null });
  const rows = Array.isArray(response?.data) ? response.data : [];
  return rows.map(mapCatalogCourseToCardProps).filter(Boolean);
}

/**
 * Single-select filter state helper — structured for future multi-select expansion.
 * @param {number|null|undefined} selectedCategoryId
 * @returns {{ mode: 'single', categoryId: number|null, categoryIds: number[] }}
 */
export function buildCatalogCategoryFilterState(selectedCategoryId) {
  const id =
    selectedCategoryId != null && Number.isFinite(Number(selectedCategoryId)) && Number(selectedCategoryId) > 0
      ? Number(selectedCategoryId)
      : null;
  return {
    mode: 'single',
    categoryId: id,
    categoryIds: id != null ? [id] : [],
  };
}

/**
 * @param {URLSearchParams|string|null|undefined} searchParams
 * @returns {number|null}
 */
export function readCategoryIdFromSearchParams(searchParams) {
  const sp =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(typeof searchParams === 'string' ? searchParams : '');
  const raw = sp.get('category');
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * @param {number|null} categoryId
 * @returns {Record<string, string>}
 */
export function writeCategorySearchParams(categoryId) {
  if (categoryId == null || !Number.isFinite(Number(categoryId)) || Number(categoryId) <= 0) {
    return {};
  }
  return { category: String(categoryId) };
}
