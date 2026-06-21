# Test Transfer Operations Runbook

Operational guide for admins and platform operators.

## Monitoring dashboard

**Admin → Dashboard → Test export / import**

| Metric | Meaning |
|--------|---------|
| Exports | Total completed export batches |
| Imports | Total import batch records |
| Failures | Export + import batches with `FAILED` status |
| Last activity | Most recent export or import timestamp |

**Admin → Tests → Export / import history**

- **Overview** — recent batches + stats
- **Export history** — format, question count, images, duration, status
- **Import history** — course, validation errors, duration, status
- **Download logs** — export/import activity log entries (JSON download available)

## Key metrics per batch

| Field | Location | Alert threshold (guidance) |
|-------|----------|----------------------------|
| `processing_time_ms` | Export/import history | > 120000 for 1000 Q tests |
| `validation_error_count` | Import history | > 0 before confirm = blocked |
| `image_count` | Both | Mismatch vs visual spot-check |
| `status` | Both | Any `FAILED` |

## Log sources

1. **Transfer activity logs** — `admin.test.export`, `admin.test.export.rich_content`, `admin.test.import`
2. **LMS action logger** — structured export start/complete/fail events
3. **Server stdout** — `[test-transfer]` warnings for non-blocking audit write failures
4. **PM2 logs** — unhandled import exceptions

## Common incidents

### Import timeout (502 / client disconnect)

**Symptoms:** Large ZIP, proxy timeout, user sees error but import may still complete.

**Response:**

1. Check import history for batch status.
2. If `COMPLETED`, verify question count in builder.
3. If `FAILED` or missing, re-import during low traffic; increase Nginx `proxy_read_timeout` for admin import routes if needed.

### Validation errors on valid export

**Symptoms:** Re-import of same ZIP fails validation after platform upgrade.

**Response:**

1. Note `error_code` in wizard response.
2. Re-export from updated source environment.
3. Compare `schema_version` in `test.json`.

### Images missing after import

**Symptoms:** Broken image icons in builder.

**Response:**

1. Confirm ZIP export was used (not JSON-only).
2. Check import batch `image_count` > 0.
3. Verify `MEDIA_STORAGE_PROVIDER` and storage path permissions on target.
4. Inspect `images/` entries in ZIP archive.

### Audit rows not appearing

**Symptoms:** Export succeeds but history empty.

**Response:**

1. Check server boot applied `ensureTestTransferAuditSchema`.
2. Look for `[test-transfer] export audit write failed` in logs.
3. Confirm admin user id is valid (exports require authenticated user FK).

## Performance tuning

- **Indexes:** `test_export_batches.created_at`, `test_import_batches.created_at` (created by migration)
- **Import size limits:** `MAX_IMPORT_PAYLOAD_BYTES` (10 MB JSON/CSV), `MAX_IMPORT_ZIP_BYTES` (100 MB)
- **Question cap:** `MAX_TEST_EXPORT_QUESTIONS` (2000) — split very large banks if needed
- Run heavy imports off-peak; validation is CPU-bound for HTML sanitization

## Deployment checklist

After deploying transfer changes:

```bash
cd Mrb-site/server
npm run test:test-rich-content
```

1. Restart API (schema ensure runs on boot).
2. Smoke test: export ZIP → import to staging course.
3. Verify dashboard counts increment.
4. Download logs JSON from transfer history page.

## Backup strategy

| Asset | Frequency | Retention |
|-------|-----------|-----------|
| ZIP exports of production tests | Before major edits | 90 days minimum |
| MySQL snapshot | Daily | Per org policy |
| Transfer activity logs | On demand (JSON download) | Incident-driven |

## Support data to collect

When escalating an import/export issue, gather:

- Export or import batch ID
- Format (json / csv / zip)
- `processing_time_ms`, `status`, `error_code`
- Downloaded activity log JSON
- Approximate question and image counts
- Redacted sample of validation errors (no student PII)
