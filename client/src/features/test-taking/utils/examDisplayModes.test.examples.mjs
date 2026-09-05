/**
 * Question display modes: all vs one_per_page.
 * Presentation only — not options, grading, or shuffle.
 *
 * Run: node src/features/test-taking/utils/examDisplayModes.test.examples.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExamItems } from './buildExamItems.js';
import { isAllQuestionsDisplay } from '../../../utils/testPresentation.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

const takingPage = read('features/test-taking/TestTakingPage.jsx');
const allView = read('features/test-taking/components/AllQuestionsView.jsx');
const questionPanel = read('features/test-taking/components/QuestionPanel.jsx');
const questionOptions = read('features/test-taking/components/QuestionOptions.jsx');
const nav = read('features/test-taking/components/NavigationBar.jsx');
const settingsForm = read('admin/components/test-settings/TestSettingsForm.jsx');
const autosave = read('features/test-taking/hooks/useExamTimer.js');
const fullscreen = read('features/test-taking/hooks/useExamFocus.js');
const submit = read('features/test-taking/hooks/useSubmitAttempt.js');
const css = read('features/test-taking/styles/test-taking.css');

const twenty = Array.from({ length: 20 }, (_, index) => ({
  id: String(index + 1),
  sectionId: index < 10 ? '1' : '2',
  questionText: `Q${index + 1}`,
}));
const items = buildExamItems(twenty, [
  { id: 1, subjectLabel: 'Physics' },
  { id: 2, subjectLabel: 'Chemistry' },
]);
const questionItems = items.filter((item) => item.type === 'question');

assert.equal(questionItems.length, 20, '1. twenty-question test builds 20 question items');
assert.equal(questionItems[0].questionNumber, 1);
assert.equal(questionItems[19].questionNumber, 20);
assert.equal(items.filter((item) => item.type === 'section').length, 2, '17. section boundaries remain intact');

assert.match(allView, /examItems\.map/);
assert.match(takingPage, /AllQuestionsView/);
assert.match(takingPage, /isScrollAll \?/);
assert.match(takingPage, /tt-exam__main--scroll-all/);
assert.equal(isAllQuestionsDisplay('all'), true, 'all questions is the scrollable page');
assert.equal(isAllQuestionsDisplay('one_per_page'), false, '7. one_per_page is not scroll-all');

assert.match(takingPage, /itemNav\.goNext/);
assert.match(takingPage, /itemNav\.goPrevious/);
assert.match(nav, /Previous/);
assert.match(nav, /Next/);
assert.match(takingPage, /QuestionPalette/);
assert.match(takingPage, /scrollQuestionIntoView/);
assert.match(takingPage, /progressLabel/);
assert.match(allView, /IntersectionObserver/);
assert.match(allView, /data-question-id/);

assert.doesNotMatch(settingsForm, /title: 'Vertical'/);
assert.doesNotMatch(settingsForm, /title: 'Horizontal'/);
assert.match(settingsForm, /All Questions/);
assert.match(settingsForm, /One Question Per Page/);
assert.match(settingsForm, /Show all questions on one scrollable exam page/);
assert.match(settingsForm, /Show one question at a time/);
assert.match(settingsForm, /name="display_mode"/);

assert.doesNotMatch(questionOptions, /tt-options--horizontal/);
assert.doesNotMatch(questionPanel, /layoutMode/);
assert.match(questionPanel, /showQuestionTotal/);

assert.match(autosave, /useAnswerAutosave/);
assert.match(takingPage, /useAnswerAutosave/);
assert.match(submit, /inFlightPromiseRef/);
assert.match(takingPage, /useExamTimer/);
assert.match(fullscreen, /requestFullscreen/);
assert.match(css, /overflow-y:\s*auto/);
assert.match(css, /tt-exam--is-fullscreen/);
assert.match(css, /flex:\s*0 0 auto/);
assert.match(css, /@media \(max-width: 1023px\)/);
assert.match(css, /\.tt-exam__sidebar\.tt-palette/);
assert.doesNotMatch(
  css,
  /\.tt-header__primary \{[^}]*flex-direction:\s*row;[^}]*flex-wrap:\s*nowrap/
);
assert.doesNotMatch(takingPage, /requestPointerLock/);
assert.doesNotMatch(fullscreen, /requestPointerLock/);
assert.doesNotMatch(takingPage, /shuffle_questions/);
assert.doesNotMatch(allView, /shuffle/);

console.log('examDisplayModes: all assertions passed');
