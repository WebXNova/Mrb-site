/**
 * Pakistan mobile number normalization and validation.
 */

export function normalizePkMobile(input) {
  if (input == null) return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.startsWith('3') && digits.length === 10) {
    digits = `0${digits}`;
  }
  if (!/^03\d{9}$/.test(digits)) return null;
  return digits;
}

export function isValidPkMobile(input) {
  return normalizePkMobile(input) !== null;
}

export function maskPhone(phone) {
  const normalized = normalizePkMobile(phone) || String(phone || '');
  if (normalized.length < 6) return normalized;
  return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`;
}
