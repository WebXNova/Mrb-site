import { z } from 'zod';

const SUPPORTED_CURRENCIES = ['PKR'];

function preprocessPricingBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  if (obj.currency != null && obj.currency_code == null) obj.currency_code = obj.currency;
  if (obj.type != null && obj.pricing_type == null) obj.pricing_type = obj.type;
  if (obj.isActive != null && obj.is_active == null) obj.is_active = obj.isActive;
  if (obj.startsAt != null && obj.starts_at == null) obj.starts_at = obj.startsAt;
  if (obj.endsAt != null && obj.ends_at == null) obj.ends_at = obj.endsAt;
  if (obj.enrollmentVisible != null && obj.enrollment_visible == null) obj.enrollment_visible = obj.enrollmentVisible;
  if (obj.publicPurchaseVisible != null && obj.public_purchase_visible == null) {
    obj.public_purchase_visible = obj.publicPurchaseVisible;
  }
  delete obj.currency;
  delete obj.type;
  delete obj.isActive;
  delete obj.startsAt;
  delete obj.endsAt;
  delete obj.enrollmentVisible;
  delete obj.publicPurchaseVisible;
  return obj;
}

const isoTimestampSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'must be an ISO-8601 timestamp' })
  .optional()
  .nullable();

const pricingBaseShape = z.object({
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
  enrollment_visible: z.boolean().optional().default(true),
  public_purchase_visible: z.boolean().optional().default(true),
  starts_at: isoTimestampSchema,
  ends_at: isoTimestampSchema,
});

/**
 * Admin PUT /admin/courses/:courseId/pricing body.
 * Domain rules enforced here (cheap, deterministic, no DB I/O):
 *  - free implies price_amount == 0
 *  - original_price_amount, when present, must be >= price_amount
 *  - when both starts_at and ends_at are present, starts_at < ends_at
 */
export const coursePricingWriteBodySchema = z
  .preprocess(preprocessPricingBody, pricingBaseShape.strip())
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
