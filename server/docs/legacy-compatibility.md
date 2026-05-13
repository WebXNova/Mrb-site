# Legacy compatibility

Transitional behaviors kept for production stability. Use the table template: **item → temporary? → removal phase → dependency**.

| Item | Temporary? | Removal phase | Dependency |
|------|----------------|---------------|------------|
| Nullable legacy columns on `courses` not selected by catalog queries | Yes | Subjects / catalog hardening | `courseCatalogQueries.service.js` narrow SELECTs |
| DTO thumbnail alias ingest (`thumbnail_url` vs storage column) | Yes | When client only sends one canonical field | `course.dto.js` |
| `tests.subject` VARCHAR | Yes | Subjects phase + data backfill | Admin tests UI, `test.service.js`, public test meta |
| `student_questions.subject` VARCHAR | Yes | Subjects phase or rename to `queue_key` | Student ask + admin Q&A filters |
| `studentPortal.service.js` defensive SQL / column fallbacks | Yes | When test schema stable | Student dashboard |
| Dynamic DDL moved to `002_legacy_incremental.sql` | N/A (historical) | Never edit applied migration; add `003+` | `applyMigrations.js` |
| `subjects` rows (relational) without lecture/test FKs | Yes (foundation) | Wire-up phase adds FKs + UI | `subject.service.js`, `003_subjects_table.sql` |

## API envelopes (breaking change log)

- **Before:** Mixed shapes (`{ data }` on some routes, `{ success: false, message }`, course errors `{ code, message }`).
- **After:** `{ success: true, data }` and `{ success: false, error: { code, message } }` (+ optional `requestId`, `details` in non-production).

## Email “subject” vs domain subject

Variables named `subject` in `email.service.js` / `emailVerification.service.js` refer to **RFC email subject lines**, not curriculum subjects. See `subject-string-inventory.md`.

## Related docs

- `subject-string-inventory.md` — grep-driven inventory and actions.
- `migrations.md` — how to run and add migrations.
- `domain-boundaries.md` — subjects phase gate checklist.
