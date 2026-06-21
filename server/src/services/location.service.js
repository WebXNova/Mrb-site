import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

function toLocation(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
  };
}

function normalizeId(raw, label) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ApiError(400, `${label} is required`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ApiError(400, `${label} must be a valid positive integer`);
  }
  return value;
}

async function findActiveLocationById(table, id, parentClause = '', parentParams = []) {
  const [rows] = await mysqlPool.query(
    `SELECT id, name, slug
     FROM ${table}
     WHERE id = ? AND is_active = TRUE ${parentClause}
     LIMIT 1`,
    [id, ...parentParams]
  );
  return rows[0] ? toLocation(rows[0]) : null;
}

export async function listProvinces() {
  const [rows] = await mysqlPool.query(
    `SELECT id, name, slug
     FROM provinces
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, name ASC, id ASC`
  );
  return rows.map(toLocation);
}

export async function listDistrictsByProvinceId(provinceId) {
  const pid = normalizeId(provinceId, 'province_id');
  const [rows] = await mysqlPool.query(
    `SELECT id, name, slug
     FROM districts
     WHERE province_id = ? AND is_active = TRUE
     ORDER BY sort_order ASC, name ASC, id ASC`,
    [pid]
  );
  return rows.map(toLocation);
}

export async function listCitiesByDistrictId(districtId) {
  const did = normalizeId(districtId, 'district_id');
  const [rows] = await mysqlPool.query(
    `SELECT id, name, slug
     FROM cities
     WHERE district_id = ? AND is_active = TRUE
     ORDER BY sort_order ASC, name ASC, id ASC`,
    [did]
  );
  return rows.map(toLocation);
}

export async function listIntermediateBoards() {
  const [rows] = await mysqlPool.query(
    `SELECT id, name, slug
     FROM intermediate_boards
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, name ASC, id ASC`
  );
  return rows.map(toLocation);
}

export async function resolveEnrollmentLocationSelection({ provinceId, districtId, cityId }) {
  const province = await findActiveLocationById('provinces', normalizeId(provinceId, 'province_id'));
  if (!province) {
    throw new ApiError(400, 'Selected province is invalid or inactive');
  }

  const district = await findActiveLocationById(
    'districts',
    normalizeId(districtId, 'district_id'),
    'AND province_id = ?',
    [province.id]
  );
  if (!district) {
    throw new ApiError(400, 'Selected district is invalid or does not belong to the selected province');
  }

  const city = await findActiveLocationById(
    'cities',
    normalizeId(cityId, 'city_id'),
    'AND district_id = ?',
    [district.id]
  );
  if (!city) {
    throw new ApiError(400, 'Selected city is invalid or does not belong to the selected district');
  }

  return { province, district, city };
}
