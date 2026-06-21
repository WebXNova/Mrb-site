import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mysqlPool } from '../config/mysql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/enrollmentFieldMappings.json');

/** @type {Record<string, unknown>|null} */
let cachedConfig = null;

function loadJsonConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    cachedConfig = JSON.parse(raw);
  } catch {
    cachedConfig = {
      targetFormFields: [],
      excludedSourceFields: [],
      defaultFieldMappings: {},
      defaultValueMappings: {},
      coursePairs: [],
    };
  }
  return cachedConfig;
}

/**
 * Load field + value mappings for a source/target course pair.
 * DB rows override JSON defaults; identical field names are used when no mapping exists.
 *
 * @param {{ sourceCourseId?: number|null, targetCourseId?: number|null }} params
 * @returns {Promise<{ fieldMappings: Record<string, string>, valueMappings: Record<string, Record<string, string>> }>}
 */
export async function loadFieldMappingConfig({ sourceCourseId = null, targetCourseId = null } = {}) {
  const json = loadJsonConfig();
  const fieldMappings = { ...(json.defaultFieldMappings || {}) };
  const valueMappings = { ...(json.defaultValueMappings || {}) };

  const pairOverride = (json.coursePairs || []).find(
    (pair) =>
      (pair.sourceCourseId == null || Number(pair.sourceCourseId) === Number(sourceCourseId)) &&
      (pair.targetCourseId == null || Number(pair.targetCourseId) === Number(targetCourseId))
  );
  if (pairOverride?.fieldMappings) {
    Object.assign(fieldMappings, pairOverride.fieldMappings);
  }
  if (pairOverride?.valueMappings) {
    for (const [field, map] of Object.entries(pairOverride.valueMappings)) {
      valueMappings[field] = { ...(valueMappings[field] || {}), ...map };
    }
  }

  try {
    const conditions = ['is_active = 1'];
    const params = [];

    conditions.push('(source_course_id IS NULL OR source_course_id = ?)');
    params.push(sourceCourseId ?? null);

    conditions.push('(target_course_id IS NULL OR target_course_id = ?)');
    params.push(targetCourseId ?? null);

    const [rows] = await mysqlPool.query(
      `SELECT source_field, target_field, value_map_json
       FROM course_field_mappings
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    for (const row of rows) {
      const sourceField = String(row.source_field || '').trim();
      const targetField = String(row.target_field || '').trim();
      if (!sourceField || !targetField) continue;
      fieldMappings[sourceField] = targetField;

      if (row.value_map_json) {
        let parsed = row.value_map_json;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            parsed = null;
          }
        }
        if (parsed && typeof parsed === 'object') {
          valueMappings[targetField] = {
            ...(valueMappings[targetField] || {}),
            ...parsed,
          };
        }
      }
    }
  } catch (error) {
    console.warn('[enrollmentFieldMapping] DB mapping load failed, using JSON config only:', error?.message);
  }

  return { fieldMappings, valueMappings };
}

/**
 * Map source enrollment fields to target form field names and apply value transforms.
 *
 * @param {Record<string, unknown>} sourceFields
 * @param {{ sourceCourseId?: number|null, targetCourseId?: number|null, logger?: (msg: string, meta?: object) => void }} options
 * @returns {Promise<{ mapped: Record<string, unknown>, omitted: string[] }>}
 */
export async function mapEnrollmentFieldsToTargetForm(sourceFields, options = {}) {
  const json = loadJsonConfig();
  const targetFormFields = new Set(json.targetFormFields || []);
  const excluded = new Set(json.excludedSourceFields || []);
  const { fieldMappings, valueMappings } = await loadFieldMappingConfig({
    sourceCourseId: options.sourceCourseId ?? null,
    targetCourseId: options.targetCourseId ?? null,
  });
  const logger = options.logger || (() => {});

  /** @type {Record<string, unknown>} */
  const mapped = {};
  const omitted = [];

  for (const [sourceKey, rawValue] of Object.entries(sourceFields || {})) {
    if (excluded.has(sourceKey)) continue;
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue;

    const targetKey = fieldMappings[sourceKey] || sourceKey;
    if (!targetFormFields.has(targetKey)) {
      omitted.push(sourceKey);
      logger(`Prefill: omitted source field "${sourceKey}" — no matching target field "${targetKey}"`, {
        sourceKey,
        targetKey,
      });
      continue;
    }

    let value = rawValue;
    const valueMap = valueMappings[targetKey];
    if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, String(value))) {
      value = valueMap[String(value)];
    }

    mapped[targetKey] = value;
  }

  return { mapped, omitted };
}

export function getTargetFormFields() {
  const json = loadJsonConfig();
  return [...(json.targetFormFields || [])];
}

export function getExcludedSourceFields() {
  const json = loadJsonConfig();
  return [...(json.excludedSourceFields || [])];
}

/** Reset cached config (tests). */
export function resetFieldMappingConfigCache() {
  cachedConfig = null;
}
