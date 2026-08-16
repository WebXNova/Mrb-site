import { z } from 'zod';
import { ApiError } from '../utils/apiError.js';
import {
  COURSE_CATEGORY_BOARD_DEFAULT,
  COURSE_CATEGORY_BOARDS,
  COURSE_CATEGORY_CLASS_LEVEL_DEFAULT,
  COURSE_CATEGORY_CLASS_LEVELS,
  COURSE_CATEGORY_DEPARTMENT_DEFAULT,
  COURSE_CATEGORY_DEPARTMENTS,
} from '../constants/courseCategoryMetadata.constants.js';

const MAX_CATEGORIES = 500;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeCategoryName(raw) {
  return String(raw ?? '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function sanitizeCategoryDescription(raw) {
  if (raw == null || raw === '') return null;
  const trimmed = String(raw ?? '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
  return trimmed === '' ? null : trimmed;
}

const categoryNameSchema = z
  .string()
  .min(2, 'Category name must be at least 2 characters')
  .max(80, 'Category name must be at most 80 characters')
  .refine((s) => s.trim().length >= 2, 'Category name cannot be empty or whitespace only');

const categoryDescriptionSchema = z
  .string()
  .max(512, 'Description must be at most 512 characters')
  .nullable()
  .optional();

const classLevelSchema = z.enum(COURSE_CATEGORY_CLASS_LEVELS).optional();
const departmentSchema = z.enum(COURSE_CATEGORY_DEPARTMENTS).optional();
const boardSchema = z.enum(COURSE_CATEGORY_BOARDS).optional();

export const createCourseCategorySchema = z
  .object({
    name: z.string().min(1, 'Category name is required'),
    description: categoryDescriptionSchema,
    class_level: classLevelSchema,
    department: departmentSchema,
    board: boardSchema,
  })
  .strict();

export const updateCourseCategorySchema = createCourseCategorySchema;

export const reorderCourseCategoriesSchema = z
  .object({
    ordered_category_ids: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_CATEGORIES)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'ordered_category_ids must not contain duplicates',
      }),
  })
  .strict();

export const replaceCourseCategoriesSchema = z
  .object({
    category_ids: z
      .array(z.number().int().positive())
      .max(MAX_CATEGORIES)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'category_ids must not contain duplicates',
      }),
  })
  .strict();

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} field
 * @param {string} defaultValue
 */
function parseEnumField(value, allowed, field, defaultValue) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim();
  if (!allowed.includes(normalized)) {
    throw new ApiError(400, `Invalid value for ${field}`, {
      code: 'INVALID_CATEGORY_METADATA',
      field,
      allowed,
    });
  }
  return normalized;
}

/**
 * @param {unknown} body
 */
export function parseCreateCourseCategoryBody(body) {
  const parsed = createCourseCategorySchema.safeParse(body ?? {});
  if (!parsed.success) {
    const enumIssue = parsed.error.issues.find((issue) =>
      ['class_level', 'department', 'board'].includes(String(issue.path[0] ?? ''))
    );
    if (enumIssue) {
      throw new ApiError(400, `Invalid value for ${String(enumIssue.path[0])}`, {
        code: 'INVALID_CATEGORY_METADATA',
        field: String(enumIssue.path[0]),
      });
    }
    throw new ApiError(422, 'Invalid course category payload', parsed.error.flatten());
  }

  const name = sanitizeCategoryName(parsed.data.name);
  const nameCheck = categoryNameSchema.safeParse(name);
  if (!nameCheck.success) {
    throw new ApiError(422, nameCheck.error.errors[0]?.message || 'Invalid category name', {
      code: 'INVALID_CATEGORY_NAME',
      field: 'name',
    });
  }

  const description = sanitizeCategoryDescription(parsed.data.description);
  if (description != null && description.length > 512) {
    throw new ApiError(422, 'Description must be at most 512 characters', {
      code: 'INVALID_CATEGORY_DESCRIPTION',
      field: 'description',
    });
  }

  return {
    name,
    description,
    class_level: parseEnumField(
      parsed.data.class_level,
      COURSE_CATEGORY_CLASS_LEVELS,
      'class_level',
      COURSE_CATEGORY_CLASS_LEVEL_DEFAULT
    ),
    department: parseEnumField(
      parsed.data.department,
      COURSE_CATEGORY_DEPARTMENTS,
      'department',
      COURSE_CATEGORY_DEPARTMENT_DEFAULT
    ),
    board: parseEnumField(parsed.data.board, COURSE_CATEGORY_BOARDS, 'board', COURSE_CATEGORY_BOARD_DEFAULT),
  };
}

/**
 * @param {unknown} body
 */
export function parseUpdateCourseCategoryBody(body) {
  return parseCreateCourseCategoryBody(body);
}

/**
 * @param {unknown} body
 * @returns {number[]}
 */
export function parseReorderCourseCategoriesBody(body) {
  const parsed = reorderCourseCategoriesSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid reorder payload', parsed.error.flatten());
  }
  return parsed.data.ordered_category_ids.map((id) => Number(id));
}

/**
 * @param {unknown} body
 * @returns {number[]}
 */
export function parseReplaceCourseCategoriesBody(body) {
  const parsed = replaceCourseCategoriesSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid course categories payload', parsed.error.flatten());
  }
  return parsed.data.category_ids.map((id) => Number(id));
}
