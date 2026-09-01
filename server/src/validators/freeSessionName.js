import { ApiError } from '../utils/apiError.js';
import { GUEST_DISPLAY_NAME_MAX, GUEST_DISPLAY_NAME_MIN } from '../constants/freeSession.constants.js';

/**
 * Server-side guest display name for Free Session start.
 * Not an account identity — stored on the temporary attempt only.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeGuestDisplayName(raw) {
  if (raw == null) {
    throw new ApiError(422, 'Enter your name to start the test.', { code: 'VALIDATION_ERROR' });
  }
  let value = String(raw).normalize('NFKC');
  value = value.replace(/<[^>]*>/g, '');
  value = value.replace(/[\u0000-\u001F\u007F]/g, '');
  value = value.replace(/\s+/g, ' ').trim();

  if (value.length < GUEST_DISPLAY_NAME_MIN) {
    throw new ApiError(422, 'Enter your name to start the test.', { code: 'VALIDATION_ERROR' });
  }
  if (value.length > GUEST_DISPLAY_NAME_MAX) {
    throw new ApiError(422, 'Name is too long.', { code: 'VALIDATION_ERROR' });
  }
  if (/[<>]/.test(value) || /https?:\/\//i.test(value) || /javascript:/i.test(value)) {
    throw new ApiError(422, 'Enter a valid name.', { code: 'VALIDATION_ERROR' });
  }
  if (!/[\p{L}]/u.test(value)) {
    throw new ApiError(422, 'Enter a valid name.', { code: 'VALIDATION_ERROR' });
  }
  if (!/^[\p{L}\p{M}\s'.-]+$/u.test(value)) {
    throw new ApiError(422, 'Enter a valid name.', { code: 'VALIDATION_ERROR' });
  }
  return value;
}
