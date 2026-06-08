# Test Result `detail_json` Snapshot Strategy

Immutable per-question review data is stored in `test_results.detail_json` at submit time. No separate snapshot table is used.

## Storage format

`detail_json` is a **JSON array** of question snapshots (one element per composed test question, in display order). Each element is written once during submission and must not be updated afterward.

### Example (stored JSON)

```json
[
  {
    "questionId": 1042,
    "questionText": "<p>Which organelle is responsible for ATP synthesis?</p>",
    "selectedOptionId": 8801,
    "selectedOptionText": "Mitochondria",
    "correctOptionId": 8801,
    "correctOptionText": "Mitochondria",
    "isCorrect": true,
    "marks": 1,
    "marksAwarded": 1,
    "selectedOption": "8801",
    "correctOption": "8801",
    "options": [
      { "id": 8801, "text": "Mitochondria", "isCorrect": true },
      { "id": 8802, "text": "Ribosome", "isCorrect": false }
    ],
    "explanation": "<p>Mitochondria produce ATP via oxidative phosphorylation.</p>"
  },
  {
    "questionId": 1043,
    "questionText": "<p>DNA replication occurs in which phase?</p>",
    "selectedOptionId": null,
    "selectedOptionText": "",
    "correctOptionId": 8810,
    "correctOptionText": "S phase",
    "isCorrect": false,
    "marks": 1,
    "marksAwarded": 0,
    "selectedOption": "",
    "correctOption": "8810",
    "options": [],
    "explanation": ""
  }
]
```

### Field reference

| Concept (spec)           | Stored key           | Type              | Notes |
|--------------------------|----------------------|-------------------|-------|
| question_id              | `questionId`         | number            | `question_bank.id` at submit time |
| question_text            | `questionText`       | string (HTML)     | Sanitized before persist |
| selected_option_id       | `selectedOptionId`   | number \| null    | `question_options.id`; null if skipped |
| selected_option_text     | `selectedOptionText` | string            | Empty when skipped |
| correct_option_id        | `correctOptionId`    | number \| null    | From composed question |
| correct_option_text      | `correctOptionText`  | string            | |
| is_correct               | `isCorrect`          | boolean           | |
| marks_awarded            | `marksAwarded`       | number            | After negative marking rules |
| (max question marks)     | `marks`              | number            | Effective marks for the question |
| (legacy string ids)      | `selectedOption`, `correctOption` | string | Kept for backward compatibility |
| (review UI)              | `options`, `explanation` | array / string | Optional display helpers |

## Storage strategy

1. **When:** Inside `submitAttempt` (same transaction as `test_results` insert and attempt status update).
2. **Source of truth at submit:** Composed questions (`loadComposedTestQuestions` with `audience: 'admin'`) plus `student_answers` for selections.
3. **Grading:** `gradeComposedAttempt()` builds the snapshot array; result is `JSON.stringify(details)` into `test_results.detail_json`.
4. **Immutability:** Treat `detail_json` as read-only after insert. Live `question_bank` / `question_options` may change later; review pages must use the snapshot only.
5. **Completion reason:** Stored separately on `test_attempts.completion_reason` (`submitted`, `auto_submitted`, `expired`, `admin_closed`).

## Retrieval strategy (result / review pages)

1. Load `test_results` by `attempt_id` (scoped via course entitlement).
2. `const questions = JSON.parse(row.detail_json || '[]')`.
3. Map for API response (sanitize HTML again on read): `questionText`, `explanation`.
4. Do **not** rejoin `question_bank` or `student_answers` for scored review UI — use snapshot fields only.
5. For list/summary views, use aggregate columns on `test_results` (`score`, `percentage`, `correct_count`, etc.) without parsing `detail_json`.

## Future extensions (no schema change)

- Wrap array in `{ "version": 1, "questions": [...] }` if metadata is needed; parsers should accept both raw array (current) and enveloped form.
- Add `displayOrder` per item if shuffle order must be preserved explicitly (today: array order matches composed order at submit).
