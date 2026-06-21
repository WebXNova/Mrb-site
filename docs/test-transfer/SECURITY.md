# Test Transfer Security Audit

Summary of security controls for the export/import system. Last reviewed for production hardening release.

## Authorization

| Control | Implementation |
|---------|----------------|
| Admin-only routes | All transfer endpoints mounted under authenticated admin router |
| Export access | `exportTest()` calls `assertTestMutationAccess` — user must manage the test's course |
| Import access | Confirm requires valid admin token; course targeting validated against admin scope |
| Rate limiting | `testWriteRateLimit` on export and import mutation routes |
| History read | Same admin session required for dashboard, history, and logs endpoints |

**Residual risk:** Compromised admin credentials grant full export/import capability. Mitigate with MFA, IP allowlists, and least-privilege admin accounts.

## Input validation

| Layer | Checks |
|-------|--------|
| Schema | JSON v1.0 structure, required fields, enum constraints |
| MCQ engine | Answer keys, option counts, duplicate detection |
| HTML sanitizer | Allowed tags/attributes; strips scripts and event handlers |
| Image URLs | Host allowlist; archive paths permitted only during ZIP import (`allowArchivePaths`) |
| Size limits | Payload byte caps; max question count (2000) |
| CSV parser | Row/column validation, encoding checks |

Validation runs on **validate**, **preview**, and **confirm** — confirm does not skip checks.

## File validation (ZIP)

| Control | Detail |
|---------|--------|
| Zip-slip protection | Reject entries with `..` or absolute paths |
| Path allowlist | Only `test.json` and `images/{48hex}.{webp,jpg,jpeg,png}` |
| MIME sniffing | Magic-byte verification on image entries |
| Hash format | 48-character hex filenames enforced |
| Size cap | `MAX_IMPORT_ZIP_BYTES` (default 100 MB) |

## Transaction safety

| Operation | Guarantee |
|-----------|-----------|
| Import confirm | Single MySQL transaction wraps test metadata, questions, options, junction rows |
| Failure | Full ROLLBACK; no partial test state |
| ZIP media | Files uploaded inside transaction; cleanup deletes files on rollback |
| Idempotency | Each import creates a new batch; repeated confirm with same payload creates duplicate tests unless user targets existing shell intentionally |

## Data exposure

| Vector | Mitigation |
|--------|------------|
| Export download | Requires admin auth; includes full question content and answers |
| Rich JSON API | Same access gate as file export; audit logged |
| Activity logs | Metadata only in UI; may include batch IDs and counts — no full HTML in logs |
| Error messages | Sanitized client messages via `safeAdminErrorMessage` on frontend |

## Audit trail

- `test_export_batches` — who exported what, when, format, duration
- `test_import_batches` — upload metadata, validation errors, duration, status
- Activity log actions — correlates user actions for forensics
- Response headers — `X-Export-Batch-Id` for traceability

## Recommendations for production

1. Restrict admin URL segment and enforce HTTPS only.
2. Set reverse-proxy body size limits consistent with ZIP cap.
3. Monitor `FAILED` batches and alert on spike.
4. Rotate admin tokens; never commit exports with credentials to git.
5. Run `npm run test:test-rich-content` in CI before deploy.

## Test coverage (security-relevant)

- Import validation suite — malformed JSON, bad answers, HTML injection attempts
- ZIP parser — zip-slip, invalid paths, oversize entries
- Scale tests — 10 / 100 / 1000 questions remain within validation time bounds
- Preservation tests — rich HTML markers survive validate → serialize → parse round-trip
