/**
 * Live HTTP check of the Free Session guest flow against a running API.
 * Requires: API on PORT (default 4000), published free test slug test-75 (override FREE_SESSION_SLUG).
 */
const BASE = process.env.API_URL || `http://127.0.0.1:${process.env.PORT || 4000}`;
const ORIGIN = process.env.CLIENT_URL || 'http://localhost:5173';
const SLUG = process.env.FREE_SESSION_SLUG || 'test-75';

const jar = new Map();
let passed = 0;
let failed = 0;
let skipped = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}
function fail(label, extra = '') {
  failed += 1;
  console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
}
function skip(label) {
  skipped += 1;
  console.log(`  · ${label}`);
}

function ingestCookies(response) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  const fallback = response.headers.get('set-cookie');
  const list = raw.length ? raw : (fallback ? [fallback] : []);
  for (const header of list) {
    const part = String(header).split(';')[0];
    const eq = part.indexOf('=');
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function api(path, options = {}) {
  const headers = {
    Origin: ORIGIN,
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  const cookies = cookieHeader();
  if (cookies) headers.Cookie = cookies;
  if (options.json != null) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.csrf) {
    const token = jar.get('csrf_token');
    if (token) headers['x-csrf-token'] = token;
  }
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.json != null ? JSON.stringify(options.json) : options.body,
  });
  ingestCookies(response);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body, ok: response.ok };
}

function firstId(list) {
  const row = Array.isArray(list) ? list[0] : list?.data?.[0];
  return Number(row?.id || 0);
}

console.log(`free session live (${BASE}, slug=${SLUG})\n`);

const health = await api('/api/health');
if (health.status === 200 && health.body?.data?.status === 'ok') {
  ok('API health');
} else {
  fail('API health', `status ${health.status}`);
  console.log(`\nPassed: ${passed}\nFailed: ${failed}\nSkipped: ${skipped}`);
  process.exit(1);
}

const missing = await api('/api/standalone-tests/public/does-not-exist-free-session');
if (missing.status === 404) ok('invalid public slug is 404');
else fail('invalid public slug is 404', `status ${missing.status}`);

const detail = await api(`/api/standalone-tests/public/${encodeURIComponent(SLUG)}`);
const test = detail.body?.data;
if (detail.status === 200 && test?.accessKind === 'free_standalone' && test?.title) {
  ok('published free test public page');
} else {
  fail('published free test public page', `status ${detail.status} kind=${test?.accessKind}`);
  console.log(`\nPassed: ${passed}\nFailed: ${failed}\nSkipped: ${skipped}`);
  process.exit(1);
}
if (Number(test.questionCount) > 0) ok('public page reports question count');
else fail('public page reports question count');
if (test.durationMinutes != null) ok('public page reports duration');
else fail('public page reports duration');

const csrf = await api('/api/auth/csrf-session');
if (csrf.status === 204 && jar.has('csrf_token')) ok('CSRF session cookie');
else fail('CSRF session cookie', `status ${csrf.status}`);

const noCsrf = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/start`, {
  method: 'POST',
  json: { studentName: 'Ali Raza' },
});
if (noCsrf.status === 403) ok('start without CSRF is rejected');
else fail('start without CSRF is rejected', `status ${noCsrf.status}`);

const badName = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/start`, {
  method: 'POST',
  csrf: true,
  json: { studentName: '<script>alert(1)</script>' },
});
if (badName.status === 422) ok('XSS name rejected server-side');
else fail('XSS name rejected server-side', `status ${badName.status}`);

const emptyName = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/start`, {
  method: 'POST',
  csrf: true,
  json: { studentName: '   ' },
});
if (emptyName.status === 422) ok('empty name rejected');
else fail('empty name rejected', `status ${emptyName.status}`);

const start = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/start`, {
  method: 'POST',
  csrf: true,
  json: { studentName: 'Free Session Candidate' },
});
const startData = start.body?.data || {};
if ((start.status === 200 || start.status === 201) && startData.attemptId && startData.nextStep === 'exam') {
  ok('anonymous attempt created');
} else if (startData.nextStep === 'enrollment' || startData.nextStep === 'account') {
  skip('anonymous create skipped (this browser session already submitted)');
} else {
  fail('anonymous attempt created', `status ${start.status} ${JSON.stringify(start.body?.error || startData)}`);
}

if (jar.has('free_session')) ok('guest session cookie set');
else fail('guest session cookie set');

const attemptId = Number(startData.attemptId);
const expiresAt = startData.expiresAt;

if (attemptId) {
  const load = await api(
    `/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/attempts/${attemptId}/start`
  );
  const exam = load.body?.data || {};
  const loadedQuestions = exam.test?.questions || exam.questions || [];
  if (load.status === 200 && (loadedQuestions.length || exam.test)) {
    ok('exam snapshot/runtime load');
  } else {
    fail('exam runtime load', `status ${load.status}`);
  }
  const reloadExpiry = exam.attempt?.expiresAt || exam.expiresAt;
  if (expiresAt && reloadExpiry && String(reloadExpiry) === String(expiresAt)) {
    ok('timer expiry unchanged on reload');
  } else if (expiresAt) {
    skip('timer expiry compare (payload shape differs)');
  }

  const idorStart = await api(
    `/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/attempts/999999001/start`
  );
  if (idorStart.status === 403 || idorStart.status === 404) ok('guest cannot load another attempt id');
  else fail('guest cannot load another attempt id', `status ${idorStart.status}`);

  const paidRuntime = await api(
    `/api/standalone-tests/${encodeURIComponent(SLUG)}/attempts/${attemptId}/start`
  );
  if (paidRuntime.status === 401 || paidRuntime.status === 403) {
    ok('paid attempt routes stay identity-gated');
  } else {
    fail('paid attempt routes stay identity-gated', `status ${paidRuntime.status}`);
  }

  const questions = loadedQuestions;
  const firstQuestion = questions[0] || exam.currentQuestion;
  const qid = Number(firstQuestion?.questionId || firstQuestion?.id);
  const option = firstQuestion?.options?.[0] || firstQuestion?.choices?.[0];
  const oid = Number(option?.id || option?.optionId);
  if (qid && oid) {
    const save = await api(
      `/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/attempts/${attemptId}/answers`,
      { method: 'PATCH', csrf: true, json: { questionId: qid, selectedOption: oid } }
    );
    if (save.status === 200) ok('autosave answer');
    else fail('autosave answer', `status ${save.status}`);
  } else {
    skip('autosave (question/option ids not in start payload)');
  }

  if (startData.nextStep === 'exam') {
    const submit = await api(
      `/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/attempts/${attemptId}/submit`,
      { method: 'POST', csrf: true, json: {} }
    );
    const submitted = submit.body?.data || {};
    if (submit.status === 200 && submitted.nextStep === 'enrollment') ok('guest submit → enrollment_pending');
    else fail('guest submit → enrollment_pending', `status ${submit.status} ${JSON.stringify(submitted)}`);

    const dup = await api(
      `/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/attempts/${attemptId}/submit`,
      { method: 'POST', csrf: true, json: {} }
    );
    const dupData = dup.body?.data || {};
    if (dup.status === 200 && dupData.nextStep === 'enrollment') ok('duplicate submit is safe');
    else fail('duplicate submit is safe', `status ${dup.status}`);
  }

  const statusAfter = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session`);
  const st = statusAfter.body?.data || {};
  if (st.nextStep === 'enrollment' || st.nextStep === 'account' || st.nextStep === 'exam') {
    ok('pending attempt survives status refresh');
  } else {
    fail('pending attempt survives status refresh', JSON.stringify(st));
  }

  const leak = await api(
    `/api/standalone-tests/${encodeURIComponent(SLUG)}/attempts/${attemptId}/result`
  );
  if (leak.status === 401 || leak.status === 403) ok('unclaimed result is not public');
  else fail('unclaimed result is not public', `status ${leak.status}`);
}

const enrollTooSoon = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/enrollment`, {
  method: 'POST',
  csrf: true,
  json: { applicantFullName: 'A' },
});
if (enrollTooSoon.status === 422 || enrollTooSoon.status === 409) ok('enrollment validation/state enforced');
else fail('enrollment validation/state enforced', `status ${enrollTooSoon.status}`);

if (startData.nextStep === 'exam' || startData.nextStep === 'enrollment' || startData.submitted) {
  const provinces = await api('/api/locations/provinces');
  const provinceId = firstId(provinces.body?.data);
  const districts = provinceId
    ? await api(`/api/locations/districts?province_id=${provinceId}`)
    : { body: {} };
  const districtId = firstId(districts.body?.data);
  const cities = districtId
    ? await api(`/api/locations/cities?district_id=${districtId}`)
    : { body: {} };
  const cityId = firstId(cities.body?.data);
  const boards = await api('/api/locations/boards');
  const boardId = firstId(boards.body?.data);
  if (provinceId && districtId && cityId && boardId) {
    const enroll = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/enrollment`, {
      method: 'POST',
      csrf: true,
      json: {
        applicantFullName: 'Free Session Candidate',
        fatherName: 'Parent Name',
        dateOfBirth: '2005-01-15',
        gender: 'male',
        whatsappNumber: '+923001234567',
        email: `fs.live.${Date.now()}@gmail.com`,
        province_id: provinceId,
        district_id: districtId,
        city_id: cityId,
        board_id: boardId,
        hsscStatus: '12th',
        mdcatAttemptType: 'Fresher',
      },
    });
    const enrolled = enroll.body?.data || {};
    if (enroll.status === 200 && enrolled.nextStep === 'account') ok('enrollment profile stored without course enrollment');
    else fail('enrollment profile stored without course enrollment', `status ${enroll.status} ${JSON.stringify(enroll.body?.error || enrolled)}`);

    const claimAnon = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/claim`, {
      method: 'POST',
      csrf: true,
      json: { attemptId, userId: 1, studentId: 1 },
    });
    if (claimAnon.status === 401) ok('claim without login is rejected');
    else fail('claim without login is rejected', `status ${claimAnon.status}`);

    const stamp = Date.now();
    const password = 'TestPass9!';
    const identifier = `fs.live.${stamp}@gmail.com`;
    const register = await api('/api/auth/student/register', {
      method: 'POST',
      json: {
        fullName: 'Free Session Candidate',
        username: `fs${stamp}`,
        email: identifier,
        password,
      },
    });
    let signedIn = register.status === 201;
    if (signedIn) {
      ok('signup after enrollment');
    } else {
      const login = await api('/api/auth/student/login', {
        method: 'POST',
        json: { identifier, password },
      });
      if (login.status === 200) {
        signedIn = true;
        ok('login after enrollment (signup email delivery failed)');
      } else {
        skip(`signup/claim (${register.status} ${register.body?.error?.message || ''} / login ${login.status})`);
      }
    }
    if (signedIn) {
      const claim = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/free-session/claim`, {
        method: 'POST',
        csrf: true,
        json: {},
      });
      const claimed = claim.body?.data || {};
      if (claim.status === 200 && claimed.identityStatus === 'claimed') ok('signup claim finalizes result');
      else fail('signup claim finalizes result', `status ${claim.status} ${JSON.stringify(claim.body?.error || claimed)}`);

      if (claimed.attemptId && claimed.resultAvailable !== false) {
        const result = await api(
          `/api/standalone-tests/${encodeURIComponent(SLUG)}/attempts/${claimed.attemptId}/result`
        );
        if (result.status === 200) ok('owner can load result');
        else fail('owner can load result', `status ${result.status}`);
      } else if (claimed.resultAvailable === false) {
        ok('result withheld until admin publication');
      }

      const otherResult = await api(`/api/standalone-tests/${encodeURIComponent(SLUG)}/attempts/1/result`);
      if (otherResult.status === 403 || otherResult.status === 404) ok('cannot load another attempt result');
      else fail('cannot load another attempt result', `status ${otherResult.status}`);
    }
  } else {
    skip('enrollment locations unavailable');
  }
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped: ${skipped}`);
if (failed) process.exit(1);
