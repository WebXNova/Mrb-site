# Test Export / Import System

Production-grade backup and migration for assessments with rich HTML, images, and metadata.

## Documentation

| Document | Purpose |
|----------|---------|
| [MIGRATION.md](./MIGRATION.md) | How to migrate tests between environments |
| [ROLLBACK.md](./ROLLBACK.md) | How to undo a failed or incorrect import |
| [OPERATIONS.md](./OPERATIONS.md) | Day-to-day admin operations, monitoring, and troubleshooting |
| [SECURITY.md](./SECURITY.md) | Authorization, validation, and transaction safety audit |

## Supported formats

| Format | Use case |
|--------|----------|
| **JSON** | API integrations, programmatic backup |
| **CSV** | Spreadsheet review, lightweight text-only tests |
| **ZIP** | Full round-trip with images (`test.json` + `images/`) |

## Admin UI

- **Tests → Import test** — 5-step import wizard (validate → preview → confirm)
- **Tests → Export / import history** — audit dashboard, export/import batches, downloadable activity logs
- **Dashboard** — export/import counts, failures, last activity

## API (admin-authenticated)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tests/:testId/export?format=json\|csv\|zip` | Download export file |
| POST | `/tests/import/validate` | Validate payload without writing |
| POST | `/tests/import/preview` | Dry-run summary |
| POST | `/tests/import/confirm` | Atomic import |
| GET | `/tests/transfer/dashboard` | Stats + recent batches |
| GET | `/tests/transfer/export-history` | Paginated export audit |
| GET | `/tests/transfer/import-history` | Paginated import audit |
| GET | `/tests/transfer/logs` | Filtered activity logs |

## Tests

```bash
cd Mrb-site/server
npm run test:test-rich-content      # full suite (includes scale + ZIP)
npm run test:test-transfer-scale    # 10 / 100 / 1000 questions + preservation
```

## Schema

Applied automatically on server boot via `ensureTestTransferAuditSchema.js`:

- `test_export_batches` — export audit rows
- Extended `test_import_batches` — `format`, `image_count`, `validation_error_count`, `processing_time_ms`

Manual SQL reference: `server/src/sql/migrations/test_transfer_audit_hardening.sql`
