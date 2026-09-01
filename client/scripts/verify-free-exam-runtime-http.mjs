/**
 * Live HTTP check for Free Session exam payload + CSS mount.
 * Does not submit (avoids occupying the last seat through enrollment).
 */
import assert from 'node:assert/strict';
import { stripExamContentLabels } from '../src/features/test-taking/utils/examContentDisplay.js';
import { normalizeAttemptQuestions, normalizeSavedAnswers } from '../src/features/test-taking/utils/normalizeQuestion.js';

const API = 'http://127.0.0.1:4000/api';
const SLUG = 'biology-200-mcqs-test-76';
const VITE = process.env.VITE_ORIGIN || 'http://localhost:5175';

const jar = new Map();

function storeCookies(response) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  for (const item of raw) {
    const pair = String(item).split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function api(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    Origin: 'http://localhost:5173',
    Referer: 'http://localhost:5173/free-test/biology-200-mcqs-test-76',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
    Cookie: cookieHeader(),
  };
  const csrf = jar.get('csrf_token');
  if (options.method && options.method !== 'GET' && csrf) {
    headers['x-csrf-token'] = csrf;
  }
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  storeCookies(response);
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

const landing = await fetch(`${VITE}/free-test/${SLUG}`);
assert.equal(landing.ok, true, 'free test landing responds');
const landingHtml = await landing.text();
assert.match(landingHtml, /<div id="root">/, 'SPA shell mounts');

const css = await fetch(`${VITE}/src/features/test-taking/styles/test-taking.css`);
assert.equal(css.ok, true, 'exam stylesheet is served by Vite');
const cssText = await css.text();
assert.match(cssText, /\.tt-exam\s*\{/);
assert.match(cssText, /\.tt-palette__grid\s*\{/);
assert.match(cssText, /\.tt-option\s*\{/);
assert.match(cssText, /grid-template-columns/);

const pageMod = await fetch(`${VITE}/src/features/test-taking/TestTakingPage.jsx`);
assert.equal(pageMod.ok, true, 'canonical exam page is the Vite module');
const pageSrc = await pageMod.text();
assert.match(pageSrc, /test-taking\.css/);
assert.match(pageSrc, /ExamHeader/);
assert.match(pageSrc, /QuestionPalette/);

const csrf = await api('/auth/csrf-session');
assert.ok(jar.get('csrf_token'), `csrf cookie issued (${csrf.response.status})`);

const publicDetail = await api(`/standalone-tests/public/${SLUG}`);
assert.equal(publicDetail.json?.data?.accessKind, 'free_standalone');

if (publicDetail.json?.data?.seatsFull || process.env.START_GUEST !== '1') {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skippedGuestStart: true,
        seatsRemaining: publicDetail.json?.data?.seatsRemaining,
        note: 'Set START_GUEST=1 to create a live attempt.',
      },
      null,
      2
    )
  );
  process.exit(0);
}

assert.equal(publicDetail.json?.data?.seatsFull, false);

const start = await api(`/standalone-tests/${SLUG}/free-session/start`, {
  method: 'POST',
  body: { studentName: 'Exam UI Verify' },
});
assert.ok([200, 201].includes(start.response.status), start.json?.message || 'guest start');
const attemptId = start.json?.data?.attemptId;
const firstExpiry = start.json?.data?.expiresAt;
assert.ok(attemptId, 'attempt id returned');
assert.ok(firstExpiry, 'server expiry returned');
assert.ok(jar.get('free_session'), 'guest cookie set');
assert.ok(jar.get('test_attempt_token'), 'attempt cookie set');

const loaded = await api(`/standalone-tests/${SLUG}/free-session/attempts/${attemptId}/start`);
assert.equal(loaded.response.status, 200, loaded.json?.message || 'load start');
const test = loaded.json?.data?.test;
const questions = normalizeAttemptQuestions(test?.questions);
assert.ok(questions.length >= 1, 'questions present');
assert.ok(questions[0].options.length >= 2, 'options are separate records');
assert.notEqual(questions[0].options[0].text, questions[0].options[1].text);

const stem = stripExamContentLabels(questions[0].questionText || '');
assert.doesNotMatch(stem, /^\s*QUESTION\s*:/i);
assert.doesNotMatch(JSON.stringify(test), /"isCorrect"/);
assert.doesNotMatch(JSON.stringify(test), /"explanation"/);

const optionId = String(questions[0].options[0].id);
const saved = await api(`/standalone-tests/${SLUG}/free-session/attempts/${attemptId}/answers`, {
  method: 'PATCH',
  body: { questionId: Number(questions[0].id), selectedOption: optionId },
});
assert.equal(saved.response.status, 200, saved.json?.message || 'autosave');

const reloaded = await api(`/standalone-tests/${SLUG}/free-session/attempts/${attemptId}/start`);
assert.equal(reloaded.response.status, 200);
assert.equal(reloaded.json?.data?.attempt?.expiresAt, firstExpiry, 'timer stays server-authoritative');
const answers = normalizeSavedAnswers(reloaded.json?.data?.savedAnswers);
assert.equal(answers[String(questions[0].id)], optionId, 'answer persists after reload');

console.log(
  JSON.stringify(
    {
      ok: true,
      attemptId,
      questionCount: questions.length,
      layoutMode: test?.layoutMode ?? test?.layout_mode,
      title: test?.title,
      stemPreview: stem.replace(/<[^>]+>/g, '').slice(0, 80),
    },
    null,
    2
  )
);
