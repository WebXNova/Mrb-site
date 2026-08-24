import { z } from 'zod';

export const scoreBandRowSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    min_score: z.coerce.number().min(0),
    max_score: z.coerce.number().min(0),
    message_html: z.string().min(1).max(50_000),
    display_order: z.coerce.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (Number(row.min_score) > Number(row.max_score)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'min_score must be less than or equal to max_score',
        path: ['min_score'],
      });
    }
  });

export const scoreBandsPayloadSchema = z.array(scoreBandRowSchema).max(50);

/**
 * Detect overlapping [min_score, max_score] ranges (inclusive).
 * @param {Array<{ min_score: number, max_score: number, display_order?: number }>} bands
 */
export function findScoreBandRangeOverlaps(bands) {
  const sorted = [...bands]
    .map((band, index) => ({
      min: Number(band.min_score),
      max: Number(band.max_score),
      index,
    }))
    .sort((a, b) => a.min - b.min || a.max - b.max);

  const overlaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.min <= prev.max) {
      overlaps.push({ firstIndex: prev.index, secondIndex: curr.index });
    }
  }
  return overlaps;
}

/**
 * @param {unknown} bands
 */
export function assertValidScoreBandsPayload(bands) {
  const parsed = scoreBandsPayloadSchema.safeParse(bands);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten() };
  }
  const overlaps = findScoreBandRangeOverlaps(parsed.data);
  if (overlaps.length) {
    return {
      ok: false,
      error: 'Score band ranges must not overlap.',
      overlaps,
    };
  }
  return { ok: true, bands: parsed.data };
}
