# Student Answer Save API (Phase 2C)

## Endpoint

`POST /api/student/attempts/:attemptId/answer`

**Auth:** JWT student + verified email + CEE entitlement.

**Body:**

```json
{
  "questionId": 15,
  "selectedOptionId": 3
}
```

## Validation flow

1. Authenticated student
2. Valid `attemptId`
3. Attempt exists
4. Student owns attempt (identity + enrollment)
5. `status = in_progress` and not expired
6. Question belongs to attempt's test (`test_questions` + active `question_bank`)
7. Option belongs to question (`question_options`)

## UPSERT

Uses `UNIQUE(attempt_id, question_id)`:

- First save → `INSERT`
- Change selection → `UPDATE selected_option_id`, refresh `answered_at`

Also updates `test_attempts.last_activity_at`.

## Example response

```json
{
  "success": true,
  "data": {
    "saved": true
  }
}
```

## Performance

Designed for autosave on every click:

- 1 attempt load query
- 1 ownership EXISTS (cached path could be added later)
- 1 question EXISTS
- 1 option EXISTS
- 1 UPSERT
- 1 activity touch

No grading, no joins across all questions, no N+1.

## Security

| Control | Implementation |
|---------|----------------|
| JWT + entitlement | CEE grid on `/api/student/*` |
| Ownership | `studentOwnsAttempt` + identity match on attempt row |
| Question scope | Must be linked to attempt's test |
| Option scope | Must belong to submitted question |
| Fail-closed | Unauthorized/missing → `404` / structured errors |
| No scoring leakage | No `is_correct`, marks, or results written |

## Files

| Layer | Path |
|-------|------|
| Route | `src/routes/student.routes.js` |
| Controller | `src/controllers/studentAttempts.controller.js` |
| Service | `src/services/studentAnswerSave.service.js` |
| SQL | `src/services/studentAnswerSave.queries.js` |
| Validation | `src/validators/studentAnswerSave.schema.js` |

## Verify

```bash
npm run test:student-answer-save
```
