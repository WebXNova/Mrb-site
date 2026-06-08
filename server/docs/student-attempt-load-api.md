# Student Attempt Load API (Phase 2B)

## Endpoint

`GET /api/student/attempts/:attemptId`

**Auth:** JWT student + verified email + CEE entitlement.

## Authorization flow

1. Authenticated student
2. Valid `attemptId`
3. Attempt exists → else `404 ATTEMPT_NOT_FOUND`
4. Attempt belongs to student (`user_id` / `student_id`) → else `403 ATTEMPT_NOT_OWNED`
5. Enrollment ownership (`studentOwnsAttempt`) → else `404` (no leakage)
6. Loadable state: `in_progress`, not expired, published test

## Response

```json
{
  "success": true,
  "data": {
    "attempt": {
      "attemptId": 44,
      "testId": 15,
      "status": "in_progress",
      "startedAt": "2026-06-04T18:00:00.000Z",
      "expiresAt": "2026-06-04T19:00:00.000Z",
      "remainingTimeSeconds": 2400
    },
    "questions": [
      {
        "question_id": 1042,
        "question_text": "<p>Which organelle produces ATP?</p>",
        "marks": 1,
        "options": [
          { "option_id": 8801, "option_text": "Mitochondria" },
          { "option_id": 8802, "option_text": "Ribosome" }
        ]
      }
    ],
    "savedAnswers": [
      { "question_id": 1042, "selected_option_id": 8801 }
    ]
  }
}
```

## Question source

```text
tests → test_questions → question_bank → question_options
```

Via `loadComposedTestQuestions(testId, { audience: 'student' })`.

## Never returned

- `is_correct`, `correct_answer`, `correct_option_id`
- `explanation`, grading metadata

## Security review

| Control | Implementation |
|---------|----------------|
| JWT + entitlement | CEE grid on `/api/student/*` |
| Ownership | Identity match + `studentOwnsAttempt` enrollment join |
| Answer leakage | Student DTO strips `isCorrect`; load uses `audience: 'student'` |
| Parameterized SQL | All queries use `?` bindings |
| State gate | Only `in_progress` + unexpired attempts |

## Files

| Layer | Path |
|-------|------|
| Route | `src/routes/student.routes.js` |
| Controller | `src/controllers/studentAttempts.controller.js` |
| Service | `src/services/studentAttemptLoad.service.js` |
| SQL | `src/services/studentAttemptLoad.queries.js` |
| DTO | `src/dto/studentAttemptLoad.dto.js` |

## Verify

```bash
npm run test:student-attempt-load
```
