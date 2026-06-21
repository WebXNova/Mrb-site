# G-09 / G-10 — Publish observability & pipeline verification

## Observability audit (before)

| Signal | Coverage |
| --- | --- |
| Security audit | `logSecurityEvent` on publish attempt / success / failure |
| Materialization | `console.info` in `testQuizDraftMaterialization.service.js` |
| Structured JSON logs | Used heavily in student attempt flows; **not** on publish path |
| Metrics | **None** — no counters or latency tracking |
| Student readiness | Implicit via `validateTestExistsAndPublished` at start; **no post-publish check** |

## G-09 — Metrics & diagnostics

### Metrics (`testPublishMetrics.service.js`)

| Metric | Type | When incremented |
| --- | --- | --- |
| `publish_success_total` | counter | Successful publish (first or replay) |
| `publish_failure_total` | counter | Any publish error |
| `publish_duration_ms` | summary | Every publish attempt (success or failure) |
| `publish_success_first_total` | counter | First-time publish |
| `publish_success_replay_total` | counter | Idempotent replay |

Failure counter also exposes `publish_failure_total{error_code="…"}` in Prometheus text format.

### Structured logs (`testPublishObservability.service.js`)

| Event | Phase |
| --- | --- |
| `PUBLISH_STARTED` | Request accepted |
| `PUBLISH_MATERIALIZED` | Draft → runtime tables |
| `PUBLISH_STUDENT_READINESS` | Post-publish readiness report |
| `PUBLISH_SUCCEEDED` | First publish complete |
| `PUBLISH_REPLAY` | Idempotent replay |
| `PUBLISH_FAILED` | Error with `errorCode`, `durationMs` |

### Scrape endpoint

```
GET /api/metrics
Accept: text/plain          → Prometheus exposition
Accept: application/json    → JSON snapshot (default)
```

## G-10 — Pipeline verification

### Student readiness (`publishedTestStudentReadiness.service.js`)

After first publish commit, `publishTest` evaluates:

1. `status = published`
2. Not soft-deleted
3. `public_slug` present
4. `test_questions` links exist
5. Active `question_bank` rows for all links
6. Each linked question has ≥2 options + one correct
7. `duration_minutes > 0`

Result logged as `PUBLISH_STUDENT_READINESS` and attached to security audit metadata (`studentReady`).

### E2E tests

```bash
npm run test:publish-metrics
npm run test:publish-pipeline-e2e
```

Scenarios:

| Scenario | Validates |
| --- | --- |
| Success | Draft not ready → published snapshot ready → metrics |
| Failure | `publish_failure_total` + error code label |
| Retry | Replay success + `publishReplay` flag |
| Concurrent | Single materialization, multiple replay successes |

## Production readiness

| Area | Status |
| --- | --- |
| Metrics export | Ready — `/api/metrics` for Prometheus / Datadog agent |
| Structured logs | Ready — JSON events with `testId`, `requestId`, `durationMs` |
| Failure diagnosis | Ready — `errorCode` in metrics + logs |
| Pipeline guard | Ready — post-publish student readiness check |
| Alerting hooks | Wire alerts on `publish_failure_total` rate and `PUBLISH_STUDENT_READINESS ready=false` |

Recommended dashboards:

- Publish success vs failure rate (5m window)
- `publish_duration_ms` p95
- Top `error_code` labels on failures
- Count of publishes with `studentReady=false` (should be 0)
