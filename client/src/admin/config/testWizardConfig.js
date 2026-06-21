/** Shared copy and routes for the simplified Create → Questions → Publish flow. */

import { adminRoute } from '../../config/adminPaths';

export const TEST_WIZARD_EDIT_PHASES = [
  {
    key: 'setup',
    label: 'Setup',
    path: (testId) => adminRoute(`tests/${testId}/edit`),
  },
  {
    key: 'questions',
    label: 'Questions',
    path: (testId) => adminRoute(`tests/${testId}/edit/questions`),
  },
];

export const TEST_WIZARD_PHASES = [
  {
    key: 'setup',
    label: 'Setup',
    path: (testId) => adminRoute(`tests/${testId}/setup`),
  },
  {
    key: 'questions',
    label: 'Questions',
    path: (testId) => adminRoute(`tests/${testId}/questions`),
  },
  {
    key: 'publish',
    label: 'Publish',
    path: (testId) => adminRoute(`tests/${testId}/details`),
  },
];

export const TEST_WIZARD_BUTTONS = {
  save: 'Save',
  saveAndAddQuestions: 'Create & add questions',
  continueToQuestions: 'Continue to questions',
  addQuestion: 'Add question',
  importAiken: 'Import Aiken file',
  publish: 'Publish',
  backToTests: 'Back to tests',
};

/**
 * @param {string} stepKey — wizard phase key
 */
export function getWizardPhaseKey(stepKey) {
  if (stepKey === 'questions') return 'questions';
  if (stepKey === 'details' || stepKey === 'publish' || stepKey === 'review') return 'publish';
  return 'setup';
}

/**
 * @param {string} phaseKey
 */
export function getWizardStepEyebrow(phaseKey) {
  const index = TEST_WIZARD_PHASES.findIndex((phase) => phase.key === phaseKey);
  const phase = TEST_WIZARD_PHASES[index] ?? TEST_WIZARD_PHASES[0];
  const stepNumber = index >= 0 ? index + 1 : 1;
  return `Step ${stepNumber} of ${TEST_WIZARD_PHASES.length} — ${phase.label}`;
}

/**
 * Previous top-level wizard phase (for back links between major steps).
 * @param {string} activeStep
 * @param {string|number} testId
 */
export function getWizardPreviousPhase(activeStep, testId, editMode = false) {
  if (!testId) return null;
  const phases = editMode ? TEST_WIZARD_EDIT_PHASES : TEST_WIZARD_PHASES;
  const phaseKey = getWizardPhaseKey(activeStep);
  const index = phases.findIndex((phase) => phase.key === phaseKey);
  if (index <= 0) return null;
  const previous = phases[index - 1];
  return { label: previous.label, to: previous.path(testId) };
}
