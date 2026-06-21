# Test Migration Guide

Use the export/import system to move assessments between staging and production, or to restore from backup.

## Prerequisites

- Admin account with test mutation access on source and target environments
- Target course must exist before import
- For image-heavy tests, always use **ZIP** export (JSON/CSV do not bundle binary media)

## Recommended workflow

### 1. Export from source

1. Open **Tests** and locate the assessment.
2. Use row actions → **Export test (ZIP + images)** for full fidelity.
3. Alternatively export JSON or CSV for text-only or API workflows.
4. Confirm the download completes; note `X-Export-Batch-Id` response header if debugging.

### 2. Validate on target (optional but recommended)

1. Open **Tests → Import test**.
2. Upload the export file.
3. Review the **Validation** screen — fix source data if errors appear.
4. Review **Preview** — confirm question count, course mapping, and warnings.

### 3. Import on target

1. Select the target course on the confirm step.
2. Run import — the operation is **atomic**: all questions commit or none do.
3. On success, open the linked test in the builder and spot-check rich content.

### 4. Verify audit trail

1. Open **Tests → Export / import history**.
2. Confirm import batch status is `COMPLETED`.
3. Check processing time and validation error count on the dashboard.

## Format selection

| Scenario | Format |
|----------|--------|
| Production backup with diagrams | ZIP |
| Cross-env migration with images | ZIP |
| Integration / scripting | JSON v1.0 |
| Spreadsheet review, no images | CSV |

## JSON schema version

Exports use `schema_version: "1.0"`. Imports reject unknown major versions. Re-export from the latest platform before migrating if the source runs an older build.

## Large tests (500+ questions)

- Validation and preview run in-process; the UI shows progress during confirm.
- Prefer off-peak windows for 1000+ question imports.
- Monitor `processing_time_ms` in import history; values above 60s warrant DB index review.

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `MEDIA_STORAGE_PROVIDER` | `local` | Must match between export and import for URL rewriting |
| `MAX_IMPORT_ZIP_BYTES` | 100 MB | Increase only with matching reverse-proxy body limits |

## Post-migration checklist

- [ ] Question count matches source export header
- [ ] Images render in quiz builder and student preview
- [ ] Tables, lists, bold text, and equations display correctly
- [ ] Correct answers and explanations intact
- [ ] Test rules and settings applied (duration, negative marking, etc.)
- [ ] Import batch shows `COMPLETED` in history
