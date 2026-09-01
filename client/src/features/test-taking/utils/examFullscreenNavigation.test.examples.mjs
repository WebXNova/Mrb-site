/**
 * Fullscreen exam navigation / scrolling / palette jump.
 *
 * Run: node src/features/test-taking/utils/examFullscreenNavigation.test.examples.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeQuestionScrollTop, getExamScrollContainer } from './examScroll.js';
import { buildExamItems } from './buildExamItems.js';
import { isAllQuestionsDisplay } from '../../../utils/testPresentation.js';
import {
  getQuestionStatus,
  getQuestionStatusLabel,
} from './questionStatus.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

const takingPage = read('features/test-taking/TestTakingPage.jsx');
const allView = read('features/test-taking/components/AllQuestionsView.jsx');
const palette = read('features/test-taking/components/QuestionPalette.jsx');
const nav = read('features/test-taking/components/NavigationBar.jsx');
const header = read('features/test-taking/components/ExamHeader.jsx');
const gate = read('features/test-taking/components/FullscreenGate.jsx');
const fullscreen = read('features/test-taking/hooks/useExamFocus.js');
const load = read('features/test-taking/hooks/useTestAttemptLoad.js');
const timer = read('features/test-taking/hooks/useExamTimer.js');
const submit = read('features/test-taking/hooks/useSubmitAttempt.js');
const css = read('features/test-taking/styles/test-taking.css');
const whatsapp = read('components/ui/MobileWhatsAppButton.jsx');

assert.equal(
  computeQuestionScrollTop({
    containerScrollTop: 400,
    questionTop: 120,
    containerTop: 0,
    stickyHeaderHeight: 80,
    extraOffset: 8,
  }),
  432,
  'palette jump accounts for sticky header'
);

assert.equal(
  computeQuestionScrollTop({
    containerScrollTop: 0,
    questionTop: 40,
    containerTop: 0,
    stickyHeaderHeight: 80,
  }),
  0,
  'scroll top never goes negative'
);

assert.equal(getExamScrollContainer(null), null);

const twenty = Array.from({ length: 20 }, (_, index) => ({
  id: String(index + 1),
  questionText: `Q${index + 1}`,
}));
const items = buildExamItems(twenty, []);
assert.equal(items.filter((item) => item.type === 'question').length, 20);
assert.equal(isAllQuestionsDisplay('all'), true);
assert.equal(isAllQuestionsDisplay('one_per_page'), false);

assert.equal(getQuestionStatusLabel('answered'), 'answered');
assert.equal(getQuestionStatusLabel('visited'), 'not answered');
assert.equal(
  getQuestionStatus({
    questionId: '10',
    currentId: '10',
    answers: { 10: 'a' },
    visited: new Set(['10']),
  }),
  'current'
);

assert.match(fullscreen, /requestFullscreen/);
assert.match(fullscreen, /fullscreenchange/);
assert.match(fullscreen, /setIsFullscreen\(true\)/);
assert.match(fullscreen, /applyExamFullscreenDocumentClass\(true\)/);
assert.match(fullscreen, /hasEnteredOnce/);
assert.doesNotMatch(fullscreen, /requestPointerLock/);
assert.doesNotMatch(fullscreen, /pointerLock/);
assert.doesNotMatch(takingPage, /onWheel/);
assert.doesNotMatch(takingPage, /touchmove/);

assert.match(css, /tt-exam-fullscreen-active/);
assert.match(css, /tt-exam--is-fullscreen/);
assert.match(css, /overflow-y:\s*auto/);
assert.match(css, /flex:\s*0 0 auto/);
assert.match(css, /min-height:\s*0/);
assert.doesNotMatch(css, /pointer-lock/);

assert.match(takingPage, /AllQuestionsView/);
assert.match(takingPage, /tt-exam__main--scroll-all/);
assert.match(takingPage, /scrollQuestionIntoView/);
assert.match(takingPage, /handleJump/);
assert.match(takingPage, /QuestionPalette/);
assert.match(takingPage, /FullscreenExitBanner/);
assert.match(takingPage, /hasEnteredOnce/);
assert.match(allView, /examItems\.map/);
assert.match(allView, /IntersectionObserver/);
assert.match(allView, /data-question-id/);

assert.match(takingPage, /itemNav\.goNext/);
assert.match(takingPage, /itemNav\.goPrevious/);
assert.match(nav, /Previous/);
assert.match(nav, /Next/);
assert.match(nav, /Submit test/);
assert.match(nav, /progressLabel/);
assert.match(takingPage, /canGoPreviousQuestion/);
assert.match(takingPage, /canGoNextQuestion/);

assert.match(palette, /Question Navigator/);
assert.match(palette, /Question \$\{number\}, \$\{getQuestionStatusLabel/);
assert.match(header, /tt-header__fs-btn/);
assert.match(header, /Exit fullscreen/);
assert.match(gate, /Enter fullscreen/);
assert.match(gate, /Return to fullscreen/);
assert.match(gate, /You left fullscreen/);

assert.match(timer, /computeRemainingSeconds\(expiresAtIso\)/);
assert.match(takingPage, /useExamTimer/);
assert.doesNotMatch(takingPage, /expiresAt\s*=/);
assert.match(takingPage, /useAnswerAutosave/);
assert.match(load, /normalizeSavedAnswers/);
assert.doesNotMatch(takingPage, /testTakingApi\.start/);
assert.match(submit, /inFlightPromiseRef/);
assert.match(takingPage, /executeSubmit/);
assert.doesNotMatch(takingPage, /shuffle_questions/);

assert.match(takingPage, /tabIndex=\{-1\}/);
assert.match(takingPage, /ArrowLeft/);
assert.match(takingPage, /ArrowRight/);
assert.match(css, /pointer-events:\s*auto/);

const jumpBlock = takingPage.slice(
  takingPage.indexOf('const handleJump'),
  takingPage.indexOf('const handleScrollQuestionVisible')
);
assert.match(jumpBlock, /scrollQuestionIntoView/);
assert.doesNotMatch(jumpBlock, /refreshSession/);
assert.doesNotMatch(jumpBlock, /startAttempt/);
assert.doesNotMatch(jumpBlock, /fetch\(/);

console.log('examFullscreenNavigation: all assertions passed');
