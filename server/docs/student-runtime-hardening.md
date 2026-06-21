# Student Runtime Hardening — Production Readiness

Status: Runtime observability + security review (runtime hardening scope)

## 1. Security review

### 1.1 Attempt JWT storage (implemented — SEC-004)

| Layer | Storage | Risk | Mitigation |
|-------|---------|------|------------|
| **Student identity** | HttpOnly cookies (`student_access_token`) | XSS cannot read session | Primary auth path; CEE binds course |
| **Attempt JWT** | HttpOnly cookie `test_attempt_token` (`path=/api/tests`, `SameSite=Strict`) | XSS cannot exfiltrate for off-machine replay | Cookie-only mode rejects Bearer; dual-auth requires student cookie + attempt cookie |
| **Client metadata** | `sessionStorage` key `test_attempt_${slug}` — `attemptId`, `expiresAt` only | XSS can read attemptId (not secret) | No JWT in JS storage |
| **Server ground truth** | `test_attempts.attempt_nonce` (MySQL) | DB compromise | Nonce rotation on save/submit/result; scoped queries |

**Slug runtime flow:** JWT carries `{ attemptId, testId, slug, nonce }`. `resolveSecureAttemptContext` compares nonce to DB. `consumeAttemptNonce` rotates on save/submit/result. Attempt cookie cleared on successful submit.

**Portal gap:** Portal start creates attempts without attempt JWT / nonce rotation. Portal load/save rely on student cookie + ownership checks only.

### 1.2 Attempt token transport modes

Env `ATTEMPT_TOKEN_MODE`:

| Mode | Cookie | JSON body token | Bearer header | Default |
|------|--------|-----------------|---------------|---------|
| `cookie` | Yes | Stripped | **Rejected** | production |
| `dual` | Yes | Included | Accepted | development |
| `bearer` | No | Included | Accepted | legacy rollback |

Related env: `ATTEMPT_COOKIE_SAMESITE` (default `strict`), `ATTEMPT_COOKIE_SECURE`, `ATTEMPT_COOKIE_PATH` (default `/api/tests`).

| Phase | Change | Rollback |
|-------|--------|----------|
| **Phase 1 (done)** | Server sets HttpOnly cookie on verify-code / mutating responses | `ATTEMPT_TOKEN_MODE=bearer` |
| **Phase 2 (done)** | Client stores only `attemptId` + `expiresAt` in sessionStorage | Re-enable dual mode |
| **Phase 3 (production)** | `ATTEMPT_TOKEN_MODE=cookie` — Bearer forbidden | `ATTEMPT_TOKEN_MODE=dual` |

**XSS residual risk:** Same-origin XSS can still invoke credentialed APIs in the victim browser (cannot exfiltrate HttpOnly cookie for cross-machine replay). Mitigate with CSP + SEC-001 sanitization.

### 1.3 Multi-enrollment support review

| Component | Behavior | Production impact |
|-----------|----------|-------------------|
| `resolveActiveEntitlement()` | **Single** active enrollment; 2+ → HTTP 409 | Student blocked from all runtime if multiple active rows |
| Slug CEE | Implicit `courseId` from sole entitlement | No course picker; slug must belong to entitled course |
| Portal listing SQL | Joins **all** owned enrollments | Lists tests across courses while CEE may 409 |
| Dashboard | Single entitlement only | Consistent with CEE |

**Recommendation:** Until product supports enrollment selection:
1. Enforce DB uniqueness on one active enrollment per student (trigger exists per audit)
2. Restrict portal listing to `resolveActiveEntitlement().courseId` only
3. Document 409 for support staff

**Not in runtime-hardening scope:** Full multi-enrollment UX (requires `courseId` on requests + picker API).

### 1.4 Answer / result leakage

Covered by G-RT-07 (`testResultVisibility.service.js`). Runtime hardening does not change those rules.

---

## 2. Observability implementation

### Metrics module

`src/observability/studentRuntimeMetrics.service.js`

| Metric | Type | Labels |
|--------|------|--------|
| `student_runtime_success_total` | Counter | `stack`, `operation` |
| `student_runtime_failure_total` | Counter | `stack`, `operation`, `error_code` |
| `attempt_creation_total` | Counter | `stack`, `resumed` |
| `attempt_submission_total` | Counter | `stack` |
| `runtime_duration_ms` | Summary | `count`, `sum`, `min`, `max`, `last` |

### HTTP middleware

`src/middleware/studentRuntimeMetrics.middleware.js` — mounted after CEE grid for `/api/tests`, `/api/student`, `/api/attempt(s)`.

### Business-event hooks

| Event | Location |
|-------|----------|
| Attempt create/resume | `testAttempt.service.js`, `studentTestStart.service.js` |
| Attempt submit | `testAttempt.service.js` |

### Audit logging

`src/observability/studentRuntimeObservability.service.js`

Events: `STUDENT_RUNTIME_OPERATION_SUCCESS`, `STUDENT_RUNTIME_OPERATION_FAILURE`, `STUDENT_RUNTIME_ATTEMPT_CREATED`, `STUDENT_RUNTIME_ATTEMPT_SUBMITTED`, `STUDENT_RUNTIME_ENTITLEMENT_DENIAL` (CEE stream).

### Export

`GET /api/metrics` — JSON `{ publish, studentRuntime }` or Prometheus text (publish + runtime combined).

---

## 3. Monitoring coverage

| Signal | Source | Dashboard panel |
|--------|--------|-----------------|
| Request success rate | `student_runtime_success_total` / (`success` + `failure`) | Runtime SLO |
| P95 latency | `runtime_duration_ms` derivative | Latency |
| Attempt starts | `attempt_creation_total{resumed=false}` | Volume |
| Attempt resumes | `attempt_creation_total{resumed=true}` | Resume ratio |
| Submissions | `attempt_submission_total` | Completion funnel |
| Failures by op | `student_runtime_failure_total` by `operation` | Error breakdown |
| Entitlement denials | CEE audit + `failure` on prep/start | Security |
| Token failures | `ATTEMPT_TOKEN_VALIDATION_FAILURE` logs | Security |

**Log queries (stdout JSON):**
- `service=studentRuntimeObservability outcome=failure`
- `event=ATTEMPT_TOKEN_VALIDATION_FAILURE`
- `event=STUDENT_RUNTIME_ATTEMPT_SUBMITTED`

---

## 4. Alerting recommendations

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Runtime error spike | `rate(student_runtime_failure_total[5m]) > 10` | Warning | Check DB/Redis; recent deploy |
| Submit failures | `rate(student_runtime_failure_total{operation="submitAttempt"}[15m]) > 5` | High | Grading/DB transaction investigation |
| High latency | `runtime_duration_ms_last > 5000` sustained 10m | Warning | DB slow query / connection pool |
| Zero submissions | `increase(attempt_submission_total[1h]) == 0` during business hours | Info | Scheduled test window / outage |
| Entitlement surge | CEE denial audit > 20/5m | High | Enrollment data / attack |
| Token validation failures | Log count > 50/5m | High | Token theft attempt or client bug |

---

## 5. Production verification checklist

### Security
- [ ] Student auth uses HttpOnly cookies only (no localStorage for access token)
- [ ] Attempt JWT not logged in access logs
- [ ] `LEGACY_RUNTIME_ALLOW` is **false** in production
- [ ] CEE grid active on `/api/tests` and `/api/student`
- [ ] `show_result_immediately` / `show_answers_after_submit` enforced (G-RT-07)
- [ ] CSP `script-src` does not allow unsafe-inline in production

### Runtime correctness
- [ ] Slug flow: create → load → save → submit → result
- [ ] Nonce rotation returns `nextAttemptToken` on save/submit
- [ ] Retake policy enforced (G-RT-04)
- [ ] Availability window enforced (G-RT-03)
- [ ] Shuffle layout persisted (G-RT-05)

### Observability
- [ ] `GET /api/metrics` returns `studentRuntime` counters
- [ ] Prometheus scrape includes `student_runtime_*` and `attempt_*` metrics
- [ ] `STUDENT_RUNTIME_ATTEMPT_CREATED` appears in logs after test start
- [ ] `STUDENT_RUNTIME_ATTEMPT_SUBMITTED` appears after submit
- [ ] Request `X-Request-Id` present on runtime responses

### Multi-enrollment
- [ ] Confirm ≤1 active enrollment per student in production data
- [ ] 409 documented for support when duplicate enrollments exist

### Tests
```bash
npm run test:student-runtime-hardening
npm run test:student-runtime-unification
npm run test:result-visibility
```

---

## 6. Final production readiness summary

| Area | Status | Notes |
|------|--------|-------|
| Slug runtime security | **Ready** | JWT + nonce rotation + CEE |
| Portal runtime security | **Partial** | No attempt JWT; no submit endpoint |
| Legacy runtime | **Disabled** | 410 default |
| Result visibility | **Ready** | G-RT-07 |
| Metrics | **Ready** | This hardening pass |
| Audit logging | **Ready** | Structured + CEE for denials |
| Multi-enrollment | **Not supported** | Fail-closed 409 |
| Attempt cookie migration | **Planned** | Phase 1–3 above |
