# G-04 — Superseded `question_bank` cleanup on rematerialization

## Problem

Publishing (or republishing) materializes a quiz draft by:

1. Deleting `test_questions` links for the test
2. Inserting new `question_bank` + `question_options` rows
3. Inserting new `test_questions` links

Prior `question_bank` rows are **not** removed. After each republish, unlinked rows remain `deleted_at IS NULL` and accumulate as orphans.

## Data model

| Table | Role |
| --- | --- |
| `question_bank` | Canonical question content; soft-delete via `deleted_at` / `deleted_by` |
| `test_questions` | Links tests to `question_bank.id` (`ON DELETE CASCADE`) |
| `student_answers` | Attempt answers; FK to `question_bank` (`ON DELETE CASCADE`) |
| `test_results` | Scores + `detail_json`; no direct FK to `question_bank` |

Active reads filter `question_bank.deleted_at IS NULL`. Hard-deleting bank rows would cascade-delete `student_answers` and break attempt history.

## Cleanup strategy

Within the **same materialization transaction** (after new links are inserted):

1. **Before** `DELETE FROM test_questions`, snapshot `question_id` values for the test.
2. **After** new links exist, run one batch `UPDATE question_bank` for snapshotted ids where **all** hold:
   - `deleted_at IS NULL`
   - `NOT EXISTS` row in `test_questions` (still safe if shared with another test)
   - `NOT EXISTS` row in `student_answers` (preserves attempt + grading history)
3. Set `deleted_at = CURRENT_TIMESTAMP`, `deleted_by = materializing user`.

Skipped rows (e.g. questions referenced by past attempts) stay active but unlinked — intentional.

Idempotent materialization skips (draft version unchanged) do **not** run cleanup.

## Scalability

- One `UPDATE … WHERE id IN (…)` per rematerialization.
- Candidate count is bounded by `MAX_QUESTIONS_PER_TEST` (200).
- No per-question round trips.

## Implementation

- `materializedQuestionCleanup.service.js` — orchestration + safety documentation
- `testQuizDraftMaterialization.repository.js` — `listLinkedQuestionIdsForTest`, `softDeleteUnlinkedSupersededQuestions`
- `testQuizDraftMaterialization.service.js` — snapshot → replace links → cleanup → mark materialized

## Verification

```bash
npm run test:materialized-question-cleanup
npm run test:quiz-draft-materialization
```
