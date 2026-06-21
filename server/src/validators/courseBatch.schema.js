import { z } from 'zod';
import { COURSE_BATCH_STATUSES } from '../constants/courseBatchStatus.js';
import { validateBatchScheduleWindow } from '../utils/batchDateTime.js';

/** Reject C0 control characters except tab/newline are not allowed in batch text fields. */
const HAS_ILLEGAL_CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function normalizeTitle(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeNullableShort(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  if (t === '') return null;
  return t;
}

function assertNoIllegalCtrl(label, v) {
  if (v != null && HAS_ILLEGAL_CTRL.test(String(v))) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: `${label} contains disallowed control characters`,
        path: [label],
      },
    ]);
  }
}

const batchStatusSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((s) => COURSE_BATCH_STATUSES.includes(s), { message: 'invalid batch status' });

/** Curated timezone tokens (operational labels); expand via migration if needed. */
export const COURSE_BATCH_TIMEZONES = [
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

const timezoneEnum = z.enum(
  /** @type {[typeof COURSE_BATCH_TIMEZONES[number], ...typeof COURSE_BATCH_TIMEZONES[number][]]} */ (COURSE_BATCH_TIMEZONES)
);

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/, 'code must be alphanumeric with optional ._- and start with alphanumeric')
  .transform((s) => s.toUpperCase());

const dateTimeSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), 'invalid ISO datetime');

function addScheduleWindowIssues(val, ctx) {
  const result = validateBatchScheduleWindow(val);
  if (!result.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: result.message,
      path: [result.field ?? 'start_date'],
    });
  }
}

function preprocessStripUnknown(raw) {
  if (typeof raw !== 'object' || raw === null) return {};
  const allowed = [
    'title',
    'code',
    'start_date',
    'end_date',
    'total_seats',
    'instructor_name',
    'schedule_label',
    'timezone',
    'status',
    'is_active',
    'show_publicly',
    'recordings_enabled',
  ];
  const out = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(raw, k)) out[k] = raw[k];
  }
  return out;
}

export const courseBatchCreateBodySchema = z.preprocess(
  preprocessStripUnknown,
  z
    .object({
      title: z
        .string()
        .max(180)
        .transform(normalizeTitle)
        .refine((s) => s.length >= 1, 'title required'),
      code: codeSchema,
      start_date: dateTimeSchema,
      end_date: dateTimeSchema,
      total_seats: z.number().int().min(1).max(100_000),
      instructor_name: z.union([z.string().max(160), z.null()]).optional(),
      schedule_label: z.union([z.string().max(180), z.null()]).optional(),
      timezone: timezoneEnum.optional().default('UTC'),
      status: batchStatusSchema.optional().default('draft'),
      is_active: z.boolean().optional().default(true),
      show_publicly: z.boolean().optional().default(true),
      recordings_enabled: z.boolean().optional().default(true),
    })
    .strict()
    .superRefine((val, ctx) => {
      try {
        assertNoIllegalCtrl('title', val.title);
        assertNoIllegalCtrl('instructor_name', val.instructor_name);
        assertNoIllegalCtrl('schedule_label', val.schedule_label);
      } catch (e) {
        if (e instanceof z.ZodError) {
          for (const iss of e.issues) ctx.addIssue(iss);
        }
      }
      addScheduleWindowIssues(val, ctx);
    })
);

function preprocessUpdate(raw) {
  if (typeof raw !== 'object' || raw === null) return {};
  const allowed = [
    'title',
    'code',
    'start_date',
    'end_date',
    'total_seats',
    'instructor_name',
    'schedule_label',
    'timezone',
    'status',
    'is_active',
    'show_publicly',
    'recordings_enabled',
  ];
  const out = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(raw, k)) out[k] = raw[k];
  }
  return out;
}

const optionalDateTime = dateTimeSchema.optional();

export const courseBatchUpdateBodySchema = z.preprocess(
  preprocessUpdate,
  z
    .object({
      title: z
        .string()
        .max(180)
        .transform(normalizeTitle)
        .optional()
        .refine((v) => v === undefined || v.length >= 1, { message: 'title cannot be empty' }),
      code: codeSchema.optional(),
      start_date: optionalDateTime,
      end_date: optionalDateTime,
      total_seats: z.number().int().min(1).max(100_000).optional(),
      instructor_name: z.union([z.string().max(160), z.null()]).optional(),
      schedule_label: z.union([z.string().max(180), z.null()]).optional(),
      timezone: timezoneEnum.optional(),
      status: batchStatusSchema.optional(),
      is_active: z.boolean().optional(),
      show_publicly: z.boolean().optional(),
      recordings_enabled: z.boolean().optional(),
    })
    .strict()
    .superRefine((val, ctx) => {
      try {
        if (val.title != null) assertNoIllegalCtrl('title', val.title);
        if (val.instructor_name != null) assertNoIllegalCtrl('instructor_name', val.instructor_name);
        if (val.schedule_label != null) assertNoIllegalCtrl('schedule_label', val.schedule_label);
      } catch (e) {
        if (e instanceof z.ZodError) {
          for (const iss of e.issues) ctx.addIssue(iss);
        }
      }
      if (val.start_date && val.end_date) {
        addScheduleWindowIssues(
          { start_date: val.start_date, end_date: val.end_date },
          ctx
        );
      }
    })
);
