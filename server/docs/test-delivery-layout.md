# G-RT-05 — Test delivery layout (`shuffle_questions` / `shuffle_options`)

Authoritative module: `src/services/attemptDeliveryLayout.service.js`

## Architecture

```
Attempt create (slug or portal)
  → load composed questions (canonical display_order / sort_order)
  → buildAttemptDeliveryLayout(seed = hash(attemptId, attemptNonce))
  → persist test_attempts.delivery_layout_json (once)

Attempt load / resume / submit
  → load composed questions
  → parse delivery_layout_json
  → applyAttemptDeliveryLayout (reorder only — IDs unchanged)
  → student DTO / gradeComposedAttempt
```

### Design decisions

| Requirement | Implementation |
|-------------|----------------|
| Order generated once per attempt | `initializeAttemptDeliveryLayout` at INSERT commit |
| Persists across refresh/resume/device | JSON column on `test_attempts` |
| Deterministic per attempt | Seeded shuffle from `attemptId` + `attempt_nonce` |
| Grading correct | Answers store `question_options.id`; grading uses option IDs, not positions |
| Auditability | Layout JSON records `seed`, flags, and full order arrays |
| Legacy attempts | `resolveAttemptDeliveryLayout` backfills on first load |

### Stored layout shape

```json
{
  "version": 1,
  "questionOrder": [3, 1, 2],
  "optionOrderByQuestion": { "1": [12, 11], "2": [22, 21] },
  "shuffleQuestions": true,
  "shuffleOptions": true,
  "seed": 2847593021
}
```

When shuffle flags are off, canonical order is stored (no randomization).

## Enforcement

- **Server authoritative:** Client receives pre-ordered questions; no client-side shuffle.
- **Answer integrity:** `student_answers.selected_option_id` references stable `question_options.id`.
- **Submit snapshot:** `detail_json` reflects delivery order at submit time for review.

## Tests

```bash
npm run test:delivery-layout
```
