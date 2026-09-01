/** Persistent test admin navigation — replaces the 3-step wizard tabs. */

import { adminRoute } from '../../config/adminPaths';

export const TEST_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: (testId) => adminRoute(`tests/${testId}/dashboard`) },
  { key: 'settings', label: 'Settings', path: (testId) => adminRoute(`tests/${testId}/settings`) },
  { key: 'questions', label: 'Questions', path: (testId) => adminRoute(`tests/${testId}/questions`) },
  { key: 'publish', label: 'Publish', path: (testId) => adminRoute(`tests/${testId}/publish`) },
  { key: 'results', label: 'Results', path: (testId) => adminRoute(`tests/${testId}/results`) },
];

/** @deprecated Use TEST_NAV_ITEMS — kept for gradual migration */
export const TEST_WIZARD_PHASES = TEST_NAV_ITEMS.map(({ key, label, path }) => ({
  key: key === 'publish' ? 'publish' : key === 'dashboard' ? 'setup' : key,
  label,
  path,
}));

export const TEST_WIZARD_EDIT_PHASES = [
  { key: 'setup', label: 'Settings', path: (testId) => adminRoute(`tests/${testId}/settings`) },
  { key: 'questions', label: 'Questions', path: (testId) => adminRoute(`tests/${testId}/questions`) },
];

export const TEST_WIZARD_BUTTONS = {
  save: 'Save',
  saveAndAddQuestions: 'Create test',
  continueToQuestions: 'Add questions',
  addQuestion: 'Add question',
  importAiken: 'Import Aiken file',
  publish: 'Publish',
  backToTests: 'Back to tests',
};

/**
 * @param {string} stepKey
 */
export function getWizardPhaseKey(stepKey) {
  const key = String(stepKey || '');
  if (key === 'questions') return 'questions';
  if (key === 'details' || key === 'publish' || key === 'review') return 'publish';
  if (key === 'settings' || key === 'setup') return 'settings';
  if (key === 'results') return 'results';
  return 'dashboard';
}

/**
 * @param {string} phaseKey
 */
export function getWizardStepEyebrow(phaseKey) {
  const item = TEST_NAV_ITEMS.find((nav) => nav.key === phaseKey || (phaseKey === 'setup' && nav.key === 'dashboard'));
  return item?.label ?? 'Test';
}

/**
 * @param {string} activeStep
 * @param {string|number} testId
 */
export function getWizardPreviousPhase(activeStep, testId, _editMode = false) {
  if (!testId) return null;
  const phaseKey = getWizardPhaseKey(activeStep);
  const index = TEST_NAV_ITEMS.findIndex((item) => item.key === phaseKey);
  if (index <= 0) return null;
  const previous = TEST_NAV_ITEMS[index - 1];
  return { label: previous.label, to: previous.path(testId) };
}
