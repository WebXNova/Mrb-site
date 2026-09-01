/** Free Session (anonymous free_standalone) identity state — orthogonal to attempt.status. */

export const FREE_SESSION_IDENTITY = Object.freeze({
  IN_PROGRESS: 'in_progress',
  ENROLLMENT_PENDING: 'enrollment_pending',
  ACCOUNT_PENDING: 'account_pending',
  CLAIMED: 'claimed',
});

export const FREE_SESSION_COOKIE_NAME = 'free_session';

export const GUEST_DISPLAY_NAME_MIN = 2;
export const GUEST_DISPLAY_NAME_MAX = 80;
