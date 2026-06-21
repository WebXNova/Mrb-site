import { z } from 'zod';

const MAX_DRAFT_JSON_BYTES = 512 * 1024;

export const courseDraftPayloadSchema = z.object({
  course: z.record(z.unknown()).optional(),
  pricing: z.record(z.unknown()).optional(),
  batches: z.array(z.record(z.unknown())).optional(),
  subjects: z.array(z.record(z.unknown())).optional(),
  step: z.number().int().min(0).max(4).optional(),
});

export const courseDraftSaveBodySchema = z
  .object({
    clear: z.literal(true).optional(),
    course: z.record(z.unknown()).optional(),
    pricing: z.record(z.unknown()).optional(),
    batches: z.array(z.record(z.unknown())).optional(),
    subjects: z.array(z.record(z.unknown())).optional(),
    step: z.number().int().min(0).max(4).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.clear === true) return;
    const payload = {
      course: body.course,
      pricing: body.pricing,
      batches: body.batches,
      subjects: body.subjects,
      step: body.step,
    };
    const parsed = courseDraftPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue(issue);
      }
    }
    const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (size > MAX_DRAFT_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Draft payload exceeds ${MAX_DRAFT_JSON_BYTES} bytes`,
        path: [],
      });
    }
  });
