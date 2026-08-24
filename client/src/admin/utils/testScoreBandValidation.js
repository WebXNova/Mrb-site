/**
 * Client-side score band overlap validation (mirrors server testScoreBands.schema.js).
 * @param {Array<{ min_score: number|string, max_score: number|string }>} bands
 */
export function findScoreBandOverlapsClient(bands) {
  const normalized = bands.map((band, index) => ({
    min: Number(band.min_score),
    max: Number(band.max_score),
    index,
  }));

  for (const row of normalized) {
    if (!Number.isFinite(row.min) || !Number.isFinite(row.max) || row.min > row.max) {
      return [{ index: row.index, message: 'Each band needs min ≤ max.' }];
    }
  }

  const sorted = [...normalized].sort((a, b) => a.min - b.min || a.max - b.max);
  const overlaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.min <= prev.max) {
      overlaps.push({
        firstIndex: prev.index,
        secondIndex: curr.index,
        message: `Bands ${prev.index + 1} and ${curr.index + 1} overlap.`,
      });
    }
  }
  return overlaps;
}

/**
 * @param {Array<{ min_score: string|number, max_score: string|number, message_html: string }>} bands
 */
export function validateScoreBandsClient(bands) {
  const errors = [];
  if (!Array.isArray(bands)) {
    return ['Score bands must be a list.'];
  }

  bands.forEach((band, index) => {
    const min = Number(band.min_score);
    const max = Number(band.max_score);
    if (!Number.isFinite(min) || min < 0) {
      errors.push(`Band ${index + 1}: min score is invalid.`);
    }
    if (!Number.isFinite(max) || max < 0) {
      errors.push(`Band ${index + 1}: max score is invalid.`);
    }
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      errors.push(`Band ${index + 1}: min must be ≤ max.`);
    }
    if (!String(band.message_html ?? '').trim()) {
      errors.push(`Band ${index + 1}: message is required.`);
    }
  });

  const overlaps = findScoreBandOverlapsClient(bands);
  overlaps.forEach((o) => errors.push(o.message));

  return errors;
}

export function createEmptyScoreBand(displayOrder = 0) {
  return {
    clientId: `band-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    min_score: '',
    max_score: '',
    message_html: '',
    display_order: displayOrder,
  };
}
