import { request } from './requestClient.js';

function publicRequest(path) {
  return request(path, { authScope: null, retryOnUnauthorized: false });
}

export const locationsApi = {
  provinces: () => publicRequest('/locations/provinces'),
  divisions: (provinceId) => publicRequest(`/locations/divisions?province_id=${encodeURIComponent(provinceId)}`),
  districts: (divisionId) => publicRequest(`/locations/districts?division_id=${encodeURIComponent(divisionId)}`),
  cities: (districtId) => publicRequest(`/locations/cities?district_id=${encodeURIComponent(districtId)}`),
  boards: () => publicRequest('/locations/boards'),
};
