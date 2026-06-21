# Phase 7 — Student Runtime Verification Audit

**Audit date:** 2026-06-12  
**Scope:** G-RT-01 through G-RT-07 (7A–7G)  
**Verdict:** **PASS** — all automated verification suites green; known portal gaps documented.

---

## Executive summary

| Phase | ID | Objective | Verdict | Tests |
|-------|-----|-----------|---------|-------|
| 7A | G-RT-01/02 | Legacy API elimination | **PASS** | 35 |
| 7B | G-RT-03 | Availability enforcement | **PASS** | 19 |
| 7C | G-RT-04 | Retake enforcement | **PASS** | 16 |
| 7D | G-RT-05 | Shuffle implementation | **PASS** | 25 |
| 7E | G-RT-07 | Result visibility enforcement | **PASS** | 27 |
| 7F | — | Portal runtime decision | **DOCUMENTED** | N/A |
| 7G | — | Runtime hardening | **PASS** | 22 |

**Total automated checks:** 144 passed, 0 failed

```bash
cd Mrb-site/server
npm run test:phase-7
```

---

## 7A — Legacy API elimination (G-RT-01 / G-RT-02)

### Requirement
Deprecate `/api/attempt` and `/api/attempts`; route traffic to canonical slug/portal runtime; CEE on all paths.

### Implementation
- `studentRuntimeCanonical.js` — canonical route map + legacy migration
- `legacyRuntimeDeprecation.js` — 410 default, `LEGACY_RUNTIME_ALLOW` emergency rollback
- CEE protection grid covers legacy namespaces
- Client `testResultApi` → portal `GET /api/student/results/:attemptId`

### Verification
| Check | Result |
|-------|--------|
| Legacy paths return 410 by default | PASS |
| CEE entitlement on `/api/attempt(s)` | PASS |
| Migration payload in 410 response | PASS |
| Client avoids legacy result endpoint | PASS |
| Canonical slug + portal routes defined | PASS |

**Command:** `npm run test:student-runtime-unification`

---

## 7B — Availability enforcement (G-RT-03)

### Requirement
Enforce `start_date` / `end_date` on create, resume, prep, and SQL INSERT guards.

### Implementation
- `testAvailabilityWindow.service.js` — phases: `ANY_ACCESS`, `CREATE_ATTEMPT`, `IN_PROGRESS`
- Wired: slug create, portal start, prep, secure context, INSERT SQL

### Verification
| Scenario | Result |
|----------|--------|
| Before `start_date` — prep blocked | PASS |
| After `end_date` — new attempt blocked | PASS |
| In-progress grace (started before end) | PASS |
| SQL race-safe INSERT guard | PASS |
| Portal start uses same service | PASS |

**Command:** `npm run test:availability-window`

---

## 7C — Retake enforcement (G-RT-04)

### Requirement
Enforce `allow_retake` + `max_attempts` server-authoritatively.

### Implementation
- `testRetakePolicy.service.js` — `assertCanCreateNewTestAttempt`, `evaluateRetakePolicy`
- SQL `TEST_RETAKE_CREATE_WHERE_SQL` on INSERT
- Prep UI + listing status reflect policy

### Verification
| Scenario | Result |
|----------|--------|
| Retake disabled + prior attempt → blocked | PASS |
| Active `in_progress` → resume only | PASS |
| `max_attempts` cap | PASS |
| Concurrent create race (SQL guard) | PASS |
| Listing `completed` when retake off | PASS |

**Command:** `npm run test:retake-policy`

---

## 7D — Shuffle implementation (G-RT-05)

### Requirement
`shuffle_questions` / `shuffle_options` — deterministic per attempt, persisted layout.

### Implementation
- `attemptDeliveryLayout.service.js` — seed from `attemptId` + `attempt_nonce`
- `test_attempts.delivery_layout_json` column
- Applied on slug load/submit + portal load

### Verification
| Scenario | Result |
|----------|--------|
| Order generated once at create | PASS |
| Resume replays identical order | PASS |
| Grading uses stable option IDs | PASS |
| Multiple attempts → different seeds | PASS |
| Portal + slug paths wired | PASS |

**Command:** `npm run test:delivery-layout`

---

## 7E — Result visibility enforcement (G-RT-07)

### Requirement
Enforce `show_result_immediately` and `show_answers_after_submit` on all student result paths.

### Implementation
- `testResultVisibility.service.js` — central guards + sanitization
- Slug `getAttemptResult`, portal `getStudentResultByAttempt` → `result.service`
- Dashboard/history redaction

### Verification
| Path | `show_result_immediately=false` | `show_answers_after_submit=false` |
|------|--------------------------------|-----------------------------------|
| Portal result | 403 | No details |
| Slug result | 403 | No details |
| Legacy result API | 403 | No answers |
| Dashboard list | `resultAvailable: false` | N/A |

**Command:** `npm run test:result-visibility`

---

## 7F — Portal runtime decision

### Decision (architectural)

**Dual-stack model — intentional for Phase 7:**

| Capability | Slug (`/api/tests/:slug/*`) | Portal (`/api/student/*`) |
|------------|----------------------------|---------------------------|
| Take test (full lifecycle) | **Primary** | Partial |
| Start / resume | JWT + nonce rotation | Cookie auth only |
| Load questions | Yes | Yes |
| Save answers | Yes (PATCH) | Yes (POST) |
| **Submit** | **Yes** | **No endpoint** |
| View result | Yes (attempt JWT) | **Preferred** (`/student/results/:id`) |
| Test listing | Via prep/slug | Yes (`/student/tests`) |

**Client routing decision:**
- Instructions + taking: slug APIs + `sessionStorage` attempt token
- Result pages: portal `GET /api/student/results/:attemptId` (even from `/tests/:slug/result`)

**Rationale:**
1. Slug flow is shareable link / course-context primary path with strongest security (nonce rotation).
2. Portal serves authenticated dashboard (listing, history, results) without slug in URL.
3. Avoid duplicating submit until portal gains attempt JWT parity.

**Known gaps (accepted debt):**
- Portal has no submit — students must complete via slug
- Portal start has no attempt JWT / nonce
- Portal listing may span courses; CEE allows single entitlement only (409 on multi-enroll)

**Future (post–Phase 7):**
1. Unify portal submit → `submitAttempt` service
2. Add attempt JWT to portal start OR require slug redirect for taking
3. Align listing SQL with single-entitlement CEE

**Status:** Documented — not a verification failure; tracked as Phase 8+ work.

---

## 7G — Runtime hardening

### Requirement
Metrics, audit logging, security review, production checklist.

### Implementation
- `studentRuntimeMetrics.service.js` — 5 metric families
- `studentRuntimeObservability.service.js` — audit events
- HTTP middleware on `/api/tests`, `/api/student`, `/api/attempt(s)`
- `GET /api/metrics` exports publish + runtime

### Verification
| Metric | Exported | Hooked |
|--------|----------|--------|
| `student_runtime_success_total` | Yes | Middleware |
| `student_runtime_failure_total` | Yes | Middleware |
| `attempt_creation_total` | Yes | create services |
| `attempt_submission_total` | Yes | submit service |
| `runtime_duration_ms` | Yes | Middleware |

**Command:** `npm run test:student-runtime-hardening`

---

## Cross-cutting security matrix (post–Phase 7)

| Control | Slug | Portal | Legacy |
|---------|------|--------|--------|
| CEE entitlement | Yes | Yes | Yes (or 410) |
| Attempt JWT + nonce | Yes | No | N/A |
| Availability window | Yes | Yes | N/A |
| Retake policy | Yes | Yes | N/A |
| Shuffle layout | Yes | Yes | N/A |
| Result visibility | Yes | Yes | Yes |
| Runtime metrics | Yes | Yes | Yes |

---

## Open items (non-blocking)

| Item | Severity | Owner |
|------|----------|-------|
| Portal submit endpoint | Medium | Phase 8 |
| Portal attempt JWT | Medium | Phase 8 |
| Multi-enrollment 409 vs listing SQL | Low | Data + product |
| Attempt token HttpOnly migration | Low | Security Phase 1–3 |
| Remove `LEGACY_RUNTIME_ALLOW` after monitoring | Low | Ops |

---

## Production sign-off checklist

- [ ] `npm run test:phase-7` — all green in CI
- [ ] `LEGACY_RUNTIME_ALLOW=false` in production
- [ ] Prometheus scrape `/api/metrics` includes `student_runtime_*`
- [ ] Manual slug E2E: prep → start → save → submit → result
- [ ] Manual visibility: test with flags off returns 403 / no details
- [ ] Support runbook for 409 multi-enrollment

---

## Reference documentation

| Phase | Doc |
|-------|-----|
| 7A | `docs/student-runtime-architecture.md` |
| 7B | `docs/test-availability-window.md` |
| 7C | `docs/test-retake-policy.md` |
| 7D | `docs/test-delivery-layout.md` |
| 7E | `docs/test-result-visibility.md` |
| 7F | This document § 7F |
| 7G | `docs/student-runtime-hardening.md` |
