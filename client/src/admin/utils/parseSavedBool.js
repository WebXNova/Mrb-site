/** Parse API/DB boolean values (0/1, "true"/"false", etc.) for form hydration. */
export function parseSavedBool(value, defaultWhenNull = true) {
  if (value === null || value === undefined) return defaultWhenNull;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return Boolean(value);
}
