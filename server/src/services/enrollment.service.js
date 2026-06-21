/**
 * @deprecated Legacy enrollment service — superseded by:
 * - courseEnrollment.service.js (student enrollment flow)
 * - enrollmentIntegrity.service.js (row creation)
 * - safepayEnrollment.service.js (admin listing / status)
 *
 * This module is retained only to surface a clear error if old imports remain.
 */

import { ApiError } from '../utils/apiError.js';

function deprecated(name) {
  return async () => {
    throw new ApiError(410, `${name} was removed; use courseEnrollment.service.js`, {
      code: 'LEGACY_ENROLLMENT_SERVICE_REMOVED',
    });
  };
}

export const createEnrollment = deprecated('createEnrollment');
export const hasDuplicatePendingEnrollment = deprecated('hasDuplicatePendingEnrollment');
export const listEnrollments = deprecated('listEnrollments');
export const getEnrollmentById = deprecated('getEnrollmentById');
export const updateEnrollmentStatus = deprecated('updateEnrollmentStatus');
