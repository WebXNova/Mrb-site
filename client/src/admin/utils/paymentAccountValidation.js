/**
 * Client-side payment account validation (UX only — server is source of truth).
 */

const JAZZCASH_PREFIX_RE = /^03(0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[5-9]|70|71)/;

export function normalizePakistaniMobileAccountNumber(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('92') && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.startsWith('3') && digits.length === 10) {
    digits = `0${digits}`;
  }

  return digits;
}

/**
 * @param {string} raw
 * @param {'jazzcash'|'easypaisa'} method
 * @returns {string|null} error message or null if valid
 */
export function validatePaymentAccountNumberClient(raw, method) {
  const normalized = normalizePakistaniMobileAccountNumber(raw);
  if (!/^03[0-9]{9}$/.test(normalized)) {
    return 'Enter a valid 11-digit Pakistani mobile number (03XXXXXXXXX).';
  }
  if (method === 'jazzcash' && !JAZZCASH_PREFIX_RE.test(normalized)) {
    return 'This number is not a valid JazzCash mobile prefix.';
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {string|null}
 */
export function validateAccountTitleClient(raw) {
  const title = String(raw ?? '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
  if (title.length < 2) return 'Account title must be at least 2 characters.';
  if (title.length > 120) return 'Account title must be at most 120 characters.';
  return null;
}

export function formatPaymentMethodLabel(method) {
  if (method === 'jazzcash') return 'JazzCash';
  if (method === 'easypaisa') return 'EasyPaisa';
  return String(method || '');
}

export function formatAuditActionLabel(action) {
  const map = {
    created: 'Created',
    updated: 'Updated',
    activated: 'Activated',
    deactivated: 'Deactivated',
  };
  return map[action] || String(action || '');
}
