# Test composition model (canonical)

## Single sources of truth

| Concern | Source |
|---------|--------|
| Test subjects | `test_subjects` → `subjects` |
| Question content | `test_questions` → `question_bank` → `question_options` |

## Removed / forbidden

- `tests.subject` VARCHAR (deprecated; dropped via `sql/migrations/drop_tests_subject_column.sql`)
- Embedded question fields on `test_questions` (`question_text`, `options_json`, `order_index`)
- Free-text `subject` in test wizard API bodies (use `subject_id` / `subject_ids`)

## Presentation

`testSubjectPresentation.service.js` resolves display labels for student/admin UIs.

## Verification

```bash
npm run test:composition-model
npm run audit:test-subject-legacy
```

Run backfill (`backfillTestSubjects.service.js` or re-save Step 1) before dropping `tests.subject`.
