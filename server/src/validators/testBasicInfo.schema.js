import { z } from 'zod';

import {
  DEFAULT_TEST_CATEGORY,
  TEST_CATEGORY_VALUES,
  TEST_TYPE_VALUES,
} from '../constants/testMetadata.constants.js';

export { TEST_TYPE_VALUES, TEST_CATEGORY_VALUES };



import { PUBLISHED_EDIT_CONTROL_KEYS } from '../services/publishedTestEdit.service.js';

export const TEST_BASIC_INFO_ALLOWED_KEYS = Object.freeze([
  'course_id',
  'title',
  'description',
  'category',
  'test_type',
  'subject_id',
  'subject_ids',
  ...PUBLISHED_EDIT_CONTROL_KEYS,
]);



const optionalTrimmedString = (max, fieldName) =>

  z.preprocess(

    (value) => {

      if (value == null) return null;

      const trimmed = String(value).replace(/\s+/g, ' ').trim();

      return trimmed === '' ? null : trimmed;

    },

    z.union([z.null(), z.string().max(max, `${fieldName} must not exceed ${max} characters`)]).optional()

  );



const requiredTrimmedString = (min, max, fieldName) =>

  z.preprocess(

    (value) => String(value ?? '').replace(/\s+/g, ' ').trim(),

    z

      .string()

      .min(min, `${fieldName} must be at least ${min} characters`)

      .max(max, `${fieldName} must not exceed ${max} characters`)

  );



const positiveInt = z.coerce.number({ invalid_type_error: 'must be a positive integer' }).int().positive();



/**

 * Step 1 — strict whitelist. Rejects unknown fields (no mass assignment).

 */

export const testBasicInfoBodySchema = z

  .object({

    course_id: z.coerce.number({ invalid_type_error: 'course_id must be an integer' }).int().positive(),

    title: requiredTrimmedString(3, 120, 'title'),

    description: z.preprocess(

      (value) => {

        if (value == null) return null;

        const trimmed = String(value).replace(/\s+/g, ' ').trim();

        return trimmed === '' ? null : trimmed;

      },

      z

        .union([

          z.null(),

          z.string().max(500, 'description must not exceed 500 characters'),

        ])

        .optional()

    ),

    category: z.preprocess(
      (value) => {
        const trimmed = String(value ?? DEFAULT_TEST_CATEGORY).replace(/\s+/g, ' ').trim();
        return trimmed === '' ? DEFAULT_TEST_CATEGORY : trimmed;
      },
      z.enum(TEST_CATEGORY_VALUES, {
        errorMap: () => ({
          message: `category must be ${TEST_CATEGORY_VALUES.join(' or ')}`,
        }),
      })
    ),

    test_type: z.enum(TEST_TYPE_VALUES, {

      errorMap: () => ({

        message: 'test_type must be one of: subject_wise, mixed_subject',

      }),

    }),

    subject_id: positiveInt.optional(),

    subject_ids: z.array(positiveInt).min(1).max(50).optional(),

  })

  .strict()

  .superRefine((data, ctx) => {

    if (data.test_type === 'subject_wise') {

      if (data.subject_id == null) {

        ctx.addIssue({

          code: z.ZodIssueCode.custom,

          message: 'subject_id is required for subject_wise tests',

          path: ['subject_id'],

        });

      }

      if (data.subject_ids != null && data.subject_ids.length > 0) {

        ctx.addIssue({

          code: z.ZodIssueCode.custom,

          message: 'Use subject_id only for subject_wise tests (not subject_ids)',

          path: ['subject_ids'],

        });

      }

    }

    if (data.test_type === 'mixed_subject') {

      if (!data.subject_ids?.length) {

        ctx.addIssue({

          code: z.ZodIssueCode.custom,

          message: 'subject_ids must contain at least one subject for mixed_subject tests',

          path: ['subject_ids'],

        });

      }

      if (data.subject_id != null) {

        ctx.addIssue({

          code: z.ZodIssueCode.custom,

          message: 'Use subject_ids only for mixed_subject tests (not subject_id)',

          path: ['subject_id'],

        });

      }

    }

  });



/**

 * Reject bodies that include keys outside the Step 1 whitelist before Zod parsing.

 * @param {unknown} body

 */

export function assertTestBasicInfoWhitelist(body) {

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {

    return { ok: false, error: 'Request body must be a JSON object' };

  }



  const forbidden = ['sub_category', 'subCategory', 'subject'];

  const forbiddenPresent = forbidden.filter((key) => Object.prototype.hasOwnProperty.call(body, key));

  if (forbiddenPresent.length) {

    return {

      ok: false,

      error: `Fields are no longer supported: ${forbiddenPresent.join(', ')}. Use subject_id or subject_ids from the course.`,

      unknownKeys: forbiddenPresent,

    };

  }



  const unknownKeys = Object.keys(body).filter((key) => !TEST_BASIC_INFO_ALLOWED_KEYS.includes(key));

  if (unknownKeys.length) {

    return {

      ok: false,

      error: `Unknown fields are not allowed: ${unknownKeys.join(', ')}`,

      unknownKeys,

    };

  }



  return { ok: true };

}


