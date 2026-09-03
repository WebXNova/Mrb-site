/**
 * Free/paid/course exams must share one TestTakingPage runtime and load exam CSS.
 *
 * Run: node src/features/test-taking/utils/examRuntimeWiring.test.examples.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAttemptId } from '../../test-instructions/utils/attemptSession.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

const router = read('routes/AppRouter.jsx');
const attemptPage = read('pages/TestAttemptPage.jsx');
const takingPage = read('features/test-taking/TestTakingPage.jsx');
const questionPanel = read('features/test-taking/components/QuestionPanel.jsx');
const questionOptions = read('features/test-taking/components/QuestionOptions.jsx');
const palette = read('features/test-taking/components/QuestionPalette.jsx');
const header = read('features/test-taking/components/ExamHeader.jsx');
const gate = read('features/test-taking/components/FullscreenGate.jsx');
const nav = read('features/test-taking/components/NavigationBar.jsx');
const skeleton = read('features/test-taking/components/TestTakingSkeleton.jsx');
const errorPage = read('features/test-taking/components/TestTakingError.jsx');
const timer = read('features/test-taking/hooks/useExamTimer.js');
const fullscreen = read('features/test-taking/hooks/useExamFocus.js');
const load = read('features/test-taking/hooks/useTestAttemptLoad.js');
const submit = read('features/test-taking/hooks/useSubmitAttempt.js');
const css = read('features/test-taking/styles/test-taking.css');

assert.match(attemptPage, /from '\.\.\/features\/test-taking\/TestTakingPage'/);
assert.match(router, /path="\/free-test\/:slug\/start"\s+element=\{<TestAttemptPage \/>\}/);
assert.match(router, /path="\/tests\/:slug\/start"/);
assert.match(router, /<TestAttemptPage \/>/);
assert.match(takingPage, /import '\.\/styles\/test-taking\.css'/);
assert.match(css, /\.tt-exam\s*\{/);
assert.match(css, /\.tt-palette__grid\s*\{/);
assert.match(css, /grid-template-columns/);
assert.match(css, /\.tt-options\s*\{/);
assert.match(css, /@import '\.\.\/\.\.\/\.\.\/components\/ui\/Button\.css'/);

assert.doesNotMatch(questionPanel, /Q\{questionNumber\}/);
assert.match(questionPanel, /Question \{questionNumber\}/);
assert.match(questionPanel, /stripExamContentLabels/);
assert.match(questionPanel, /sanitizeStudentRichHtml/);
assert.doesNotMatch(questionPanel, /QUESTION:/);

assert.match(questionOptions, /className=\{`tt-option/);
assert.match(questionOptions, /type="radio"/);
assert.match(questionOptions, /onSelectOption\(questionId, optionId\)/);
assert.doesNotMatch(questionOptions, /tt-options--horizontal/);
assert.doesNotMatch(questionOptions, /layoutMode === 'horizontal'/);

assert.match(palette, /Question Navigator/);
assert.match(palette, /PaletteButton/);
assert.match(palette, /tt-palette__btn--\$\{status\}/);
assert.match(palette, /Not Answered/);
assert.match(palette, /Not Visited/);

assert.match(header, /Time remaining/);
assert.doesNotMatch(header, /Time left:/);
assert.match(header, /tt-header__title/);
assert.match(header, /\{title\}/);

assert.match(gate, /Fullscreen mode required/);
assert.match(fullscreen, /requestFullscreen/);
assert.match(fullscreen, /fullscreenchange/);

assert.match(nav, /Previous/);
assert.match(nav, /Next/);
assert.match(nav, /Submit [Tt]est/);
assert.match(nav, /onPrevious/);
assert.match(nav, /onNext/);
assert.match(nav, /onSubmit/);

assert.match(timer, /computeRemainingSeconds\(expiresAtIso\)/);
assert.doesNotMatch(timer, /useState\(duration/);
assert.match(timer, /\}, \[enabled\]\);/);
assert.match(load, /normalizeSavedAnswers/);
assert.match(load, /data\?\.attempt\?\.expiresAt/);
assert.match(load, /normalizeAttemptId/);
assert.match(load, /payloadRef/);
assert.match(load, /if \(!payloadRef\.current\)/);
assert.match(load, /\[loadNonce, slug\]/);
assert.doesNotMatch(load, /session\.accessKind, session\.attemptId/);
assert.doesNotMatch(load, /clearAttemptSession\(slug\)/);
assert.match(takingPage, /status === 'loading' && !payload/);
assert.match(submit, /inFlightPromiseRef/);
assert.match(takingPage, /isAllQuestionsDisplay\(displayMode\)/);
assert.match(takingPage, /AllQuestionsView/);
assert.match(takingPage, /NavigationBar/);
assert.match(palette, /questionIds\.map/);
assert.match(gate, /FullscreenExitBanner/);
assert.match(header, /tt-header__fs-btn/);

const freeStartCount = (router.match(/path="\/free-test\/:slug\/start"/g) || []).length;
const paidStartCount = (router.match(/path="\/tests\/:slug\/start"/g) || []).length;
assert.equal(freeStartCount, 1, 'free start route is unique');
assert.equal(paidStartCount, 1, 'course/paid start route is unique');

const landing = read('features/free-session/FreeTestLandingPage.jsx');
assert.match(landing, /startingRef/);
assert.match(landing, /startingRef\.current = true/);
assert.match(skeleton, /Loading Test\.\.\./);
assert.match(skeleton, /MRB Classes/);
assert.match(errorPage, /Unable to load this test\./);
assert.match(errorPage, /Try Again/);

assert.equal(normalizeAttemptId('42'), 42);
assert.equal(normalizeAttemptId(42), 42);
assert.equal(normalizeAttemptId(null), null);
assert.equal(normalizeAttemptId(0), null);
assert.equal(normalizeAttemptId('abc'), null);

console.log('examRuntimeWiring: all assertions passed');
