function isBlankScoreBandField(value) {
  const text = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '';
}

/**
 * Empty "Add band" rows must not block saving other settings.
 * A row is a placeholder only when min, max, and message are all empty.
 */
export function isPlaceholderScoreBand(band) {
  return (
    isBlankScoreBandField(band?.min_score) &&
    isBlankScoreBandField(band?.max_score) &&
    isBlankScoreBandField(band?.message_html)
  );
}

/**
 * @param {Array<{ min_score?: unknown, max_score?: unknown, message_html?: unknown }>} bands
 */
export function selectCompletableScoreBands(bands) {
  if (!Array.isArray(bands)) return [];
  return bands.filter((band) => !isPlaceholderScoreBand(band));
}

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

  const complete = selectCompletableScoreBands(bands);

  complete.forEach((band, index) => {
    const minRaw = String(band.min_score ?? '').trim();
    const maxRaw = String(band.max_score ?? '').trim();
    const min = Number(band.min_score);
    const max = Number(band.max_score);
    if (minRaw === '' || !Number.isFinite(min) || min < 0) {
      errors.push(`Band ${index + 1}: min score is invalid.`);
    }
    if (maxRaw === '' || !Number.isFinite(max) || max < 0) {
      errors.push(`Band ${index + 1}: max score is invalid.`);
    }
    if (Number.isFinite(min) && Number.isFinite(max) && minRaw !== '' && maxRaw !== '' && min > max) {
      errors.push(`Band ${index + 1}: min must be ≤ max.`);
    }
    if (isBlankScoreBandField(band.message_html)) {
      errors.push(`Band ${index + 1}: message is required.`);
    }
  });

  const overlaps = findScoreBandOverlapsClient(complete);
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
