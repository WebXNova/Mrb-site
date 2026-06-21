import { isTestPublishedStatus } from './testBasicInfoValidation';

/**
 * @param {Record<string, unknown>} payload
 * @param {{ confirmPublishedEdit?: boolean, expectedUpdatedAt?: string|null }} [controls]
 */
export function withPublishedEditControls(payload, controls = {}) {
  const next = { ...payload };
  if (controls.confirmPublishedEdit) {
    next.confirm_published_edit = true;
  }
  if (controls.expectedUpdatedAt) {
    next.expected_updated_at = controls.expectedUpdatedAt;
  }
  return next;
}

/**
 * @param {{ title?: string, status?: string }} test
 */
export function confirmPublishedTestEdit(test) {
  const published = isTestPublishedStatus(test?.status);
  if (!published) return true;

  return window.confirm(
    `This test is live${test?.title ? `: "${test.title}"` : ''}.\n\n` +
      'Changes will affect future attempts immediately. Existing attempts keep their original questions.\n\n' +
      'Proceed with saving?'
  );
}

export const PUBLISHED_EDIT_WARNING =
  'This test is live. Changes will affect future attempts immediately. Proceed with caution.';
