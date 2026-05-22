/**
 * Shared Zod contract for admin course wizard (create) — imported by the API
 * and by the admin client (via Vite alias `@course-wizard-schema`) so rules stay aligned.
 */
import { z } from 'zod';

export const COURSE_WIZARD_LEVELS = ['beginner', 'intermediate', 'advanced'];

export const COURSE_WIZARD_BATCH_TIMEZONES = [
  'UTC',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Riyadh',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const SUPPORTED_CURRENCIES = ['PKR'];

const isoTimestampSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'must be an ISO-8601 timestamp' })
  .optional()
  .nullable();

export const courseWizardCourseSchema = z.object({
  title: z.string().trim().min(3).max(180),
  short_description: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).trim()))
    .pipe(z.union([z.string().max(512), z.null()]).optional()),
  description: z
    .string()
    .trim()
    .min(30, { message: 'description must be at least 30 characters' })
    .max(65_000),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  thumbnail_url: z.preprocess((v) => {
    if (v === undefined) return undefined;
    if (v == null || v === '') return null;
    const t = String(v).trim();
    return t === '' ? null : t;
  }, z.union([z.string().max(1000), z.null()]).optional()),
  is_active: z.boolean().optional().default(true),
});

export const courseWizardPricingSchema = z
  .object({
    pricing_type: z.enum(['free', 'one_time', 'subscription']),
    price_amount: z.number().int().min(0).max(10_000_000),
    original_price_amount: z.number().int().min(0).max(10_000_000).optional().nullable(),
    currency_code: z
      .string()
      .trim()
      .toUpperCase()
      .refine((c) => SUPPORTED_CURRENCIES.includes(c), { message: 'unsupported currency' })
      .default('PKR'),
    is_active: z.boolean().optional().default(true),
    starts_at: isoTimestampSchema,
    ends_at: isoTimestampSchema,
    enrollment_visible: z.boolean().optional().default(true),
    public_purchase_visible: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.pricing_type === 'free' && data.price_amount !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price_amount'],
        message: 'price_amount must be 0 when pricing_type is "free"',
      });
    }
    if (
      data.original_price_amount != null &&
      Number.isFinite(data.original_price_amount) &&
      data.original_price_amount <= data.price_amount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['original_price_amount'],
        message: 'original_price_amount must be greater than price_amount when set',
      });
    }
    if (data.starts_at && data.ends_at) {
      const start = Date.parse(data.starts_at);
      const end = Date.parse(data.ends_at);
      if (Number.isFinite(start) && Number.isFinite(end) && start >= end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ends_at'],
          message: 'ends_at must be after starts_at',
        });
      }
    }
  });

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`)), 'invalid date');

const dateTimeSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), 'invalid ISO datetime');

const batchStatusSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (s) =>
      [
        'draft',
        'published',
        'upcoming',
        'enrollment_open',
        'running',
        'completed',
        'cancelled',
        'archived',
      ].includes(s),
    { message: 'invalid batch status' }
  );

export const courseWizardBatchItemSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    start_date: dateOnlySchema,
    end_date: dateOnlySchema,
    enrollment_open_at: dateTimeSchema,
    enrollment_close_at: dateTimeSchema,
    total_seats: z.number().int().min(1).max(100_000),
    instructor_name: z.union([z.string().max(160), z.null()]).optional(),
    schedule_label: z.union([z.string().max(180), z.null()]).optional(),
    timezone: z
      .string()
      .optional()
      .default('UTC')
      .refine((tz) => COURSE_WIZARD_BATCH_TIMEZONES.includes(tz), { message: 'unsupported timezone' }),
    status: batchStatusSchema.optional().default('draft'),
    is_active: z.boolean().optional().default(true),
    allow_enrollment: z.boolean().optional().default(true),
    show_publicly: z.boolean().optional().default(true),
    certificate_enabled: z.boolean().optional().default(false),
    recordings_enabled: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.start_date >= val.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'end_date must be after start_date',
        path: ['end_date'],
      });
    }
    const open = Date.parse(val.enrollment_open_at);
    const close = Date.parse(val.enrollment_close_at);
    if (!(open < close)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'enrollment_open_at must be before enrollment_close_at',
        path: ['enrollment_close_at'],
      });
    }
    const endDay = Date.parse(`${val.end_date}T23:59:59.999Z`);
    if (close > endDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'enrollment_close_at must not be after course end_date',
        path: ['enrollment_close_at'],
      });
    }
    const batchStart = Date.parse(`${val.start_date}T00:00:00.000Z`);
    if (Number.isFinite(close) && Number.isFinite(batchStart) && !(close < batchStart)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'enrollment_close_at must be before batch start_date',
        path: ['enrollment_close_at'],
      });
    }
  });

export const courseWizardSubjectItemSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z
    .string()
    .max(8000)
    .optional()
    .nullable()
    .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).trim())),
  order_index: z.number().int().min(0).max(1_000_000),
});

function batchesOverlap(a, b) {
  const a0 = Date.parse(`${a.start_date}T00:00:00.000Z`);
  const a1 = Date.parse(`${a.end_date}T23:59:59.999Z`);
  const b0 = Date.parse(`${b.start_date}T00:00:00.000Z`);
  const b1 = Date.parse(`${b.end_date}T23:59:59.999Z`);
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
  const active = (r) =>
    r.is_active !== false &&
    !['draft', 'cancelled', 'archived'].includes(String(r.status || '').toLowerCase());
  if (!active(a) || !active(b)) return false;
  return a0 <= b1 && b0 <= a1;
}

function preprocessWizardBody(raw) {
  if (typeof raw !== 'object' || raw === null) return {};
  const o = { ...raw };
  const course = typeof o.course === 'object' && o.course ? { ...o.course } : {};
  if (o.coverImage != null && (course.thumbnail_url == null || String(course.thumbnail_url).trim() === '')) {
    course.thumbnail_url = o.coverImage;
  }
  delete o.coverImage;
  if (Object.keys(course).length > 0) {
    o.course = course;
  }
  return o;
}

export const courseWizardBodySchema = z
  .preprocess(
    preprocessWizardBody,
    z
      .object({
        publish: z.boolean(),
        course: courseWizardCourseSchema,
        pricing: courseWizardPricingSchema,
        // STRICT: exactly one batch per course
        batches: z.array(courseWizardBatchItemSchema).length(1),
        subjects: z.array(courseWizardSubjectItemSchema).max(200),
      })
      .strict()
  )
  .superRefine((data, ctx) => {
    const titles = data.subjects.map((s) => s.title.toLowerCase());
    const seen = new Set();
    for (let i = 0; i < titles.length; i += 1) {
      const t = titles[i];
      if (seen.has(t)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'duplicate subject title in this course',
          path: ['subjects', i, 'title'],
        });
      }
      seen.add(t);
    }

    if (data.publish) {
      const thumb = data.course.thumbnail_url;
      if (thumb == null || String(thumb).trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'thumbnail is required to publish',
          path: ['course', 'thumbnail_url'],
        });
      }
      if (data.subjects.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'at least one subject is required to publish',
          path: ['subjects'],
        });
      }
      if (data.batches.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'at least one batch is required to publish',
          path: ['batches'],
        });
      }
    }

    const list = data.batches;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (batchesOverlap(list[i], list[j])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'active batches must not have overlapping schedule windows',
            path: ['batches', j, 'start_date'],
          });
        }
      }
    }
  });
