import { request } from './requestClient.js';

function publicRequest(path) {
  return request(path, { authScope: null, retryOnUnauthorized: false });
}

export const locationsApi = {
  provinces: () => publicRequest('/locations/provinces'),
  districts: (provinceId) => publicRequest(`/locations/districts?province_id=${encodeURIComponent(provinceId)}`),
  /** All active cities (enrollment form — not scoped by district). */
  allCities: () => publicRequest('/locations/cities'),
  /** District-scoped cities (admin / legacy callers). */
  cities: (districtId) => publicRequest(`/locations/cities?district_id=${encodeURIComponent(districtId)}`),
  boards: () => publicRequest('/locations/boards'),
};
