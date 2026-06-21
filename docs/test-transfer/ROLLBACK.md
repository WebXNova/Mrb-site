# Test Import Rollback Guide

Imports are transactional at the database layer. Understanding failure modes helps you recover safely.

## Automatic rollback (failed import)

When **confirm import** fails after partial writes:

1. The MySQL transaction is rolled back — no test questions remain.
2. Uploaded media files from the ZIP are deleted via the import media cleanup hook.
3. The import batch row is marked `FAILED` with `error_code` and `error_message`.
4. Activity log records `admin.test.import` with failure metadata.

**Action:** Fix the validation issue shown in the wizard or import history, then re-import. No manual DB cleanup is required.

## Successful import — undo options

There is no one-click “undo import” button. Choose based on impact:

### Option A — Delete the imported test (recommended for new tests)

If the import created a **new** test:

1. Open the test in admin.
2. Delete the test (cascades to questions, options, and test_questions links).
3. Orphaned question-bank rows may remain if shared; use question bank cleanup policies if applicable.

### Option B — Re-import over existing test

If you imported into an existing test shell and need to revert:

1. Export the **previous** good version from backup (ZIP).
2. Delete current test questions via builder or delete the test entirely.
3. Re-import the backup file.

### Option C — Database restore (last resort)

For bulk incorrect imports or data corruption:

1. Stop the API (`pm2 stop mrb-api` or equivalent).
2. Restore MySQL from the latest pre-import snapshot.
3. Restart API and verify import history reflects restored state.

**Warning:** Restoring DB snapshots rolls back all changes since the backup, not only the import.

## Export batch failures

Failed exports do not create audit rows (course FK required at write time). Check:

- Application logs / LMS action logger for `test.export.failed`
- Activity logs filtered under **Download logs** in transfer history

Re-attempt export after resolving access or data issues.

## Media rollback after partial ZIP processing

ZIP media upload runs inside the confirm transaction. On failure:

- Files written during the attempt are removed.
- No stale `images/` paths should remain in question HTML.

If orphaned files appear under the question-bank storage root, run storage audit scripts per [OPERATIONS.md](./OPERATIONS.md).

## Rollback decision matrix

| Situation | Safe action |
|-----------|-------------|
| Import wizard shows validation errors | Do not confirm; fix file |
| Confirm failed mid-flight | Re-import; DB already clean |
| Wrong course selected | Delete imported test; re-import to correct course |
| Content wrong but structure OK | Export good source; replace via re-import |
| Multiple tests affected | DB snapshot restore |

## Prevention

- Always run **Validate** and **Preview** before confirm.
- Keep ZIP backups before destructive edits.
- Use staging import dry-runs for 500+ question tests.
