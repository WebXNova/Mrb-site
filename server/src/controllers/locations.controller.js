import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  listCitiesByDistrictId,
  listDistrictsByProvinceId,
  listIntermediateBoards,
  listProvinces,
} from '../services/location.service.js';

function readRequiredQueryId(req, key) {
  const raw = req.query[key];
  const value = Number(raw);
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ApiError(400, `${key} is required`);
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new ApiError(400, `${key} must be a valid positive integer`);
  }
  return value;
}

export const getProvinces = asyncHandler(async (_req, res) => {
  const data = await listProvinces();
  sendSuccess(res, data);
});

export const getDistricts = asyncHandler(async (req, res) => {
  const provinceId = readRequiredQueryId(req, 'province_id');
  const data = await listDistrictsByProvinceId(provinceId);
  sendSuccess(res, data);
});

export const getCities = asyncHandler(async (req, res) => {
  const districtId = readRequiredQueryId(req, 'district_id');
  const data = await listCitiesByDistrictId(districtId);
  sendSuccess(res, data);
});

export const getBoards = asyncHandler(async (_req, res) => {
  const data = await listIntermediateBoards();
  sendSuccess(res, data);
});
