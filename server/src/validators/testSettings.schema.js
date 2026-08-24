import { z } from 'zod';
import { PUBLISHED_EDIT_CONTROL_KEYS } from '../services/publishedTestEdit.service.js';
import { scoreBandsPayloadSchema } from './testScoreBands.schema.js';

export const TEST_SETTINGS_ALLOWED_KEYS = Object.freeze([
  'shuffle_questions',
  'shuffle_options',
  'show_explanations',
  'show_result_immediately',
  'show_answers_after_submit',
  'access_mode',
  'layout_mode',
  'display_mode',
  'full_page_mode',
  'introduction_html',
  'conclusion_html',
  'score_bands',
  'start_date',
  'end_date',
  ...PUBLISHED_EDIT_CONTROL_KEYS,
]);

export const TEST_ACCESS_MODES = Object.freeze(['public', 'private']);
export const TEST_LAYOUT_MODES = Object.freeze(['vertical', 'horizontal']);
export const TEST_DISPLAY_MODES = Object.freeze(['all', 'one_per_page']);

const strictBoolean = z.boolean({
  required_error: 'Boolean value is required',
  invalid_type_error: 'Value must be true or false',
});

const nullableIsoDateSchema = z.preprocess((value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}, z.union([z.null(), z.string().datetime({ message: 'Invalid ISO datetime' })]));

const nullableRichHtmlSchema = z.preprocess((value) => {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}, z.union([z.null(), z.string().max(100_000)]));

/**
 * Step 3 — strict whitelist. Rejects unknown fields (no mass assignment).
 */
export const testSettingsBodySchema = z
  .object({
    shuffle_questions: strictBoolean,
    shuffle_options: strictBoolean,
    show_explanations: strictBoolean,
    show_result_immediately: strictBoolean,
    show_answers_after_submit: strictBoolean.optional(),
    access_mode: z.enum(TEST_ACCESS_MODES),
    layout_mode: z.enum(TEST_LAYOUT_MODES).optional(),
    display_mode: z.enum(TEST_DISPLAY_MODES).optional(),
    full_page_mode: strictBoolean.optional(),
    introduction_html: nullableRichHtmlSchema.optional(),
    conclusion_html: nullableRichHtmlSchema.optional(),
    score_bands: scoreBandsPayloadSchema.optional(),
    start_date: nullableIsoDateSchema.optional(),
    end_date: nullableIsoDateSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const nowMs = Date.now();

    if (data.start_date != null) {
      const startMs = new Date(data.start_date).getTime();
      if (Number.isNaN(startMs)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'start_date is invalid', path: ['start_date'] });
      } else if (startMs < nowMs - 60_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'start_date must not be in the past',
          path: ['start_date'],
        });
      }
    }

    if (data.start_date != null && data.end_date != null) {
      const startMs = new Date(data.start_date).getTime();
      const endMs = new Date(data.end_date).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'end_date must be on or after start_date',
          path: ['end_date'],
        });
      }
    }
  });

/**
 * @param {unknown} body
 */
export function assertTestSettingsWhitelist(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const unknownKeys = Object.keys(body).filter((key) => !TEST_SETTINGS_ALLOWED_KEYS.includes(key));
  if (unknownKeys.length) {
    return {
      ok: false,
      error: `Unknown fields are not allowed: ${unknownKeys.join(', ')}`,
      unknownKeys,
    };
  }

  return { ok: true };
}
