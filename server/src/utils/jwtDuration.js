const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const DEFAULT_REFRESH_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Parse JWT-style duration strings (`15m`, `90d`, `7d`) to milliseconds.
 * Mirrors jsonwebtoken `expiresIn` units for cookie/session alignment.
 */
export function parseJwtDurationMs(value, fallbackMs = DEFAULT_REFRESH_MS) {
  if (value == null || value === '') return fallbackMs;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.ceil(value);
  }

  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallbackMs;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && raw === String(asNumber) && asNumber > 0) {
    return Math.ceil(asNumber * 1000);
  }

  const match = /^(\d+(?:\.\d+)?)([smhdw])$/.exec(raw);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unitMs = UNIT_MS[match[2]];
  if (!Number.isFinite(amount) || amount <= 0 || !unitMs) return fallbackMs;
  return Math.ceil(amount * unitMs);
}

export { DEFAULT_REFRESH_MS };
