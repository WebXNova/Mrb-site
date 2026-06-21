# Q&A Audit Logging Architecture

Hardened observability for all Student/Teacher Q&A audit events. No logging failure is silently ignored.

## Logging Architecture

```
Q&A handlers (controllers, services, middleware)
        │
        ▼
writeQaAuditEvent / writeQaAuditEventFromReq
        │
        ├─ sanitizeMetadata() — denylist keys + JWT/Bearer/Basic patterns
        ├─ inferQaAuditCategory() — compliance taxonomy
        │
        ├─ Retry loop (default 3 attempts, exponential backoff)
        │     └─ insertActivityLogRecord() → activity_logs (MySQL)
        │
        ├─ On success: metrics + optional structured stdout (non-prod)
        │
        └─ On exhaustion:
              ├─ Dead-letter → data/qa-audit-dlq/events.jsonl
              ├─ ERROR structured log (qa_audit_persist_failed)
              ├─ failure metrics
              └─ threshold alert (qa_audit_failure_threshold_exceeded)
```

### Canonical event categories

| Category | Example actions |
|----------|-----------------|
| `question_created` | `student.question.create` |
| `question_viewed` | `student.question.detail.viewed`, `teacher.question.opened`, `teacher.question.inbox.viewed` |
| `question_answered` | `teacher.question.answer.created` |
| `upload_accepted` | `student.question.upload.success`, `teacher.question.recording.success` |
| `upload_rejected` | `*.upload.validation_failed`, `*.upload.mime_mismatch`, `teacher.question.answer.rejected` |
| `authorization_denied` | `*.access.denied`, `*.view.denied`, `student.question.create.denied` |
| `suspicious_activity` | `*.rate_limit`, `student.question.security.*`, `qa.upload.cleanup.*` |

### Structured log shape (stdout / SIEM)

```json
{
  "level": "ERROR",
  "component": "qa_audit",
  "schemaVersion": "1.0",
  "timestamp": "2026-06-13T12:00:00.000Z",
  "alert": "qa_audit_persist_failed",
  "event": "persist_failed",
  "action": "student.question.create",
  "eventCategory": "question_created",
  "attempts": 3,
  "dlqWritten": true
}
```

### Secret redaction

Never logged: passwords, tokens, JWTs, API keys, cookies, CSRF values, captcha responses, webhook secrets.

Application error codes (`errorCode`) are preserved. OTP-like `code` values (4–8 digits) are redacted.

## Monitoring Architecture

### Metrics (`GET /api/metrics`)

Prometheus counters under `qa_audit_log_*`:

| Metric | Meaning |
|--------|---------|
| `qa_audit_log_success_total` | Events persisted to `activity_logs` |
| `qa_audit_log_failure_total` | Persist failures after all retries |
| `qa_audit_log_retry_total` | Retry attempts |
| `qa_audit_log_dlq_total` | Events written to dead-letter file |
| `qa_audit_log_dlq_failure_total` | Dead-letter writes that also failed |
| `qa_audit_log_alert_total` | Operational alerts emitted |

Labels: `by_action`, `by_category`, `failures_by_action`.

### Recommended alerts

1. **`qa_audit_log_failure_total` rate > 0** for 5m — audit pipeline degraded.
2. **`qa_audit_log_dlq_total` increase** — inspect `data/qa-audit-dlq/events.jsonl`.
3. **`qa_audit_log_alert_total` increase** — failure threshold exceeded (default: 5 failures / 60s).
4. **Log query**: `alert="qa_audit_persist_failed"` OR `alert="qa_audit_dlq_write_failed"`.

### Dashboards

- Event volume by `eventCategory` (from `activity_logs.metadata_json` or metrics `by_category`).
- Failure rate = `failure_total / (success_total + failure_total)`.
- DLQ depth = line count in `events.jsonl`.

## Failure Handling Strategy

1. **Retry** — transient DB errors retried with exponential backoff (`QA_AUDIT_LOG_MAX_RETRIES`, `QA_AUDIT_LOG_RETRY_DELAY_MS`).
2. **Dead-letter** — full event envelope appended to JSONL when retries exhaust (`QA_AUDIT_LOG_DLQ_ENABLED`, `QA_AUDIT_LOG_DLQ_DIR`).
3. **Error visibility** — structured `ERROR` logs always emitted on persist failure; DLQ write failure emits a second alert.
4. **Alert generation** — sliding-window threshold (`QA_AUDIT_LOG_ALERT_THRESHOLD` / `QA_AUDIT_LOG_ALERT_WINDOW_MS`) increments `qa_audit_log_alert_total`.
5. **Non-blocking requests** — audit calls remain `void`/`await` fire-and-forget at HTTP layer; failures never abort user flows but are never silent.

### DLQ replay (operational)

1. Inspect `data/qa-audit-dlq/events.jsonl`.
2. Replay via admin script or manual `INSERT` into `activity_logs` using sanitized `event` payload.
3. Delete replayed lines after verification.

## Configuration

```env
QA_AUDIT_LOG_MAX_RETRIES=3
QA_AUDIT_LOG_RETRY_DELAY_MS=100
QA_AUDIT_LOG_DLQ_ENABLED=true
QA_AUDIT_LOG_DLQ_DIR=data/qa-audit-dlq
QA_AUDIT_LOG_STDOUT_ENABLED=false
QA_AUDIT_LOG_ALERT_THRESHOLD=5
QA_AUDIT_LOG_ALERT_WINDOW_MS=60000
```

## Verification

```bash
npm run test:qa-audit-logging-security
```

## Migrated call sites

- `studentQuestionViewAudit.service.js`
- `teacherQuestionDetailAudit.service.js`
- `studentQuestionSecurityAudit.service.js`
- `studentQuestionCreate.service.js`
- `qaImageUpload.service.js` / `qaAudioUpload.service.js`
- `qaUploadCleanup.service.js`
- `studentQuestionRateLimit.js`
- `teacherQuestionAnswerRateLimit.js`
- `teacherQuestionDetailRateLimit.js`

Legacy `logActivity()` remains for non-Q&A modules (still swallows errors by design).
