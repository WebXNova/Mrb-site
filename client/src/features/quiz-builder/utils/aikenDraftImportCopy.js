/** User-facing copy for quiz-builder Aiken load (preview → draft only; no question_bank writes). */

export const AIKEN_DRAFT_LOAD_BUTTON = 'Import Aiken file';
export const AIKEN_DRAFT_LOADING_BUTTON = 'Previewing file…';
export const AIKEN_DRAFT_SAVING_BUTTON = 'Saving to test…';

export const AIKEN_DRAFT_EMPTY_HELP =
  'Click Add question to build manually, or import an Aiken file to start.';

export const AIKEN_DRAFT_PUBLISH_NOTE =
  'Questions are saved to the question bank when you publish the test.';

export const AIKEN_DRAFT_SAVE_FAILED =
  'Could not save imported questions to this test. Nothing was changed.';

export const AIKEN_DRAFT_SAVE_OFFLINE =
  'Imported questions are backed up in this browser only. Reconnect and try again.';

/**
 * @param {number} count
 * @param {string} fileLabel
 */
export function aikenDraftLoadSuccessMessage(count, fileLabel) {
  const noun = count === 1 ? 'question' : 'questions';
  return `${count} ${noun} added to this test from "${fileLabel}".`;
}

/**
 * @param {number} count
 * @param {string} fileLabel
 * @param {number} skippedCount
 */
export function aikenDraftLoadPartialSuccessMessage(count, fileLabel, skippedCount) {
  const skipped = skippedCount === 1 ? 'question' : 'questions';
  return `${aikenDraftLoadSuccessMessage(count, fileLabel)} ${skippedCount} ${skipped} skipped due to errors.`;
}
