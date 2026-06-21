# Q&A Orphan Upload Cleanup — Architecture

## Problem

Q&A uploads (`student-qa`, `teacher-qa`) can become storage orphans when:

- A student uploads an image/recording but never submits the question
- A teacher uploads answer media but never submits the answer
- Multer leaves abandoned `.upload` temp files after failed validation
- Files exceed TTL with no `student_questions` row referencing them

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Scheduled trigger                            │
│  • External cron: npm run cleanup:qa-uploads                     │
│  • Optional in-process: QA_UPLOAD_CLEANUP_SCHEDULE_ENABLED       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              qaUploadCleanup.service.js                          │
│  1. BEGIN TRANSACTION                                            │
│  2. loadReferencedUploadIndex() — snapshot from DB               │
│  3. scanNamespaceForCandidates() — filesystem + TTL filter       │
│  4. For each candidate (batched):                                │
│       isUploadStillReferenced() — transactional re-check         │
│       → quarantine (default) or delete                             │
│  5. COMMIT (or ROLLBACK for dry-run / audit)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   activity_logs      Prometheus          quarantine/
   qa.upload.cleanup.*  /api/metrics    uploads/_quarantine/qa/
```

## Reference model

| Namespace | DB columns checked |
|-----------|-------------------|
| `student-qa` | `attachment_url`, `audio_url` |
| `teacher-qa` | `answer_attachment_url`, `answer_audio_url` |

Matching uses `LIKE '%/filename'` inside a transaction immediately before any file action.

## Safety guarantees

1. **Never delete active files** — TTL gate (`mtime` age) skips recent uploads
2. **Never delete referenced files** — snapshot + transactional re-check
3. **Transactional checks** — DB transaction wraps reference load + per-file verify
4. **Quarantine-first** — default `QA_UPLOAD_CLEANUP_MODE=quarantine` (recoverable)
5. **Dry-run** — `--dry-run` reports candidates, rolls back, no file changes
6. **Audit mode** — `--audit` logs every candidate to `activity_logs`, no file changes

## Orphan classification

| Reason | Description |
|--------|-------------|
| `abandoned_temp` | `.upload` multer temp past short TTL |
| `unlinked_question` | `student-qa` file not in question columns |
| `unlinked_answer` | `teacher-qa` file not in answer columns |

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `QA_UPLOAD_CLEANUP_ORPHAN_TTL_HOURS` | `24` | Unlinked final file eligibility |
| `QA_UPLOAD_CLEANUP_TEMP_TTL_HOURS` | `1` | Abandoned `.upload` eligibility |
| `QA_UPLOAD_CLEANUP_QUARANTINE_RETENTION_DAYS` | `30` | Days before quarantine purge |
| `QA_UPLOAD_CLEANUP_BATCH_SIZE` | `100` | Max files per run |
| `QA_UPLOAD_CLEANUP_MODE` | `quarantine` | `quarantine` or `delete` |
| `QA_UPLOAD_CLEANUP_SCHEDULE_ENABLED` | `false` | In-process scheduler |
| `QA_UPLOAD_CLEANUP_INTERVAL_MINUTES` | `360` | Scheduler interval |

## Operations

```bash
# Preview candidates (safe)
npm run cleanup:qa-uploads:dry-run

# Audit log only
npm run cleanup:qa-uploads:audit

# Production cleanup + optional quarantine purge
npm run cleanup:qa-uploads
npm run cleanup:qa-uploads -- --purge-quarantine
```

**Recommended cron (Railway / system):**

```
0 */6 * * * cd /app/server && npm run cleanup:qa-uploads -- --purge-quarantine
```

## Recovery strategy

Quarantined files live at:

```
uploads/_quarantine/qa/{namespace}/{YYYYMMDD}/{original-filename}
```

**Restore a file:**

```bash
mv uploads/_quarantine/qa/student-qa/20260614/42-abc.jpg uploads/student-qa/
```

**After restore:** ensure `student_questions` row references the URL, or the next cleanup run will quarantine it again.

**Permanent deletion:** runs with `--purge-quarantine` remove quarantine files older than retention days.

## Failure scenarios

| Scenario | Behavior | Mitigation |
|----------|----------|------------|
| File referenced between scan and action | `isUploadStillReferenced` returns true → skip | Transactional re-check |
| Question submitted during cleanup | Re-check catches new reference → skip | Same |
| DB unavailable | Job fails, transaction rolls back | Alert on error logs; retry next cron |
| Filesystem race (file deleted externally) | `stat`/`rename` fails → `skipped_error` | Logged; non-blocking |
| Overlapping scheduler runs | Second run skipped (`running` guard) | Idempotent per file |
| False positive (TTL too low) | Recent orphan quarantined | Increase `ORPHAN_TTL_HOURS`; restore from quarantine |
| `delete` mode misconfiguration | Hard delete without recovery | **Keep default `quarantine`** |

## Monitoring strategy

### Metrics (`GET /api/metrics`)

| Metric | Alert if |
|--------|----------|
| `qa_upload_cleanup_runs_total` | Stops increasing for >24h (cron broken) |
| `qa_upload_cleanup_candidates_total` | Spike >3× baseline (upload abuse / client bug) |
| `qa_upload_cleanup_skipped_referenced_total` | Sustained high rate (race or TTL too aggressive) |
| `qa_upload_cleanup_skipped_error_total` | Any sustained >0 |
| `qa_upload_cleanup_quarantined_total` | Track storage reclamation trend |

### Audit logs (`activity_logs`)

| Action | Meaning |
|--------|---------|
| `qa.upload.cleanup.candidate` | Dry-run / audit candidate |
| `qa.upload.cleanup.removed` | File quarantined or deleted |
| `qa.upload.cleanup.error` | Per-file failure |
| `qa.upload.cleanup.completed` | Run summary |

### Recommended alerts

1. **Cron heartbeat** — `qa_upload_cleanup_runs_total` unchanged for 12h
2. **Error rate** — `skipped_error_total / candidates_total > 0.05`
3. **Quarantine disk** — monitor `uploads/_quarantine/qa` directory size
4. **Spike detection** — `candidates_total` > 500/run (investigate client or attack)

## Files

| File | Role |
|------|------|
| `src/constants/qaUpload.constants.js` | Namespaces + column mapping |
| `src/services/qaUploadReferenceIndex.service.js` | DB reference index |
| `src/services/qaUploadCleanup.service.js` | Core cleanup engine |
| `src/observability/qaUploadCleanupMetrics.service.js` | Metrics |
| `src/jobs/qaUploadCleanupScheduler.js` | Optional in-process scheduler |
| `scripts/run-qa-upload-cleanup.mjs` | Cron CLI |
