# Student Test Workflow

## Student Test Flow

```mermaid
sequenceDiagram
    participant S as Student
    participant FE as Frontend
    participant BE as Backend
    participant DB as Database
    participant SS as SessionStorage

    Note over S: Step 1 - Login + Test Access
    S->>FE: Sign in (/login)
    FE->>BE: POST /auth/student/login
    BE-->>FE: student_access_token
    S->>FE: Open /tests/:slug
    FE->>BE: POST /tests/:slug/verify-code (Bearer student token)
    BE->>DB: Validate attempt limits + create attempt
    BE-->>FE: attempt_id + attempt_token + startUrl
    FE->>SS: Save attempt session

    Note over S: Step 2 - Start Attempt
    S->>FE: Go to /tests/:slug/start
    FE->>BE: GET /tests/:slug/attempts/:attemptId/start (Bearer attempt token)
    BE->>DB: Validate attempt + fetch questions
    BE-->>FE: Questions + expires_at + nextAttemptToken
    FE->>FE: Start countdown
    FE->>SS: Initialize answer map

    Note over S: Step 3 - Answer + Autosave
    loop For each answer
        S->>FE: Select option
        FE->>SS: Save instantly
        FE->>BE: PATCH /tests/:slug/attempts/:attemptId/answers
        BE->>DB: Upsert answer
        BE-->>FE: nextAttemptToken
    end

    Note over S: Step 4 - Submit
    alt Student submits
        S->>FE: Submit
    else Timer hits zero
        FE->>FE: Auto-submit
    end
    FE->>BE: POST /tests/:slug/attempts/:attemptId/submit
    BE->>DB: Evaluate + store test_results
    BE-->>FE: result_id + nextAttemptToken

    Note over S: Step 5 - Result + History
    FE->>BE: GET /tests/:slug/attempts/:attemptId/result
    BE-->>FE: Full review payload
    FE->>BE: GET /student/dashboard
    BE-->>FE: Tests + Lectures + Attempt history
```

## APIs

- `POST /api/auth/student/register`
- `POST /api/auth/student/login`
- `GET /api/auth/student/me`
- `GET /api/student/dashboard`
- `GET /api/student/results/:attemptId`
- `POST /api/tests/:slug/verify-code` (requires student login)
- `GET /api/tests/:slug/attempts/:attemptId/start`
- `PATCH /api/tests/:slug/attempts/:attemptId/answers`
- `POST /api/tests/:slug/attempts/:attemptId/submit`
- `GET /api/tests/:slug/attempts/:attemptId/result`

## Security + Access Rules

- Student must be authenticated before starting an attempt.
- Rate limiting uses Redis (`ratelimit:test-start:*`) with in-memory fallback.
- Attempt token uses nonce rotation: each protected call returns `nextAttemptToken`.
- Attempt caps are enforced by user id + student name + device fingerprint.

## Frontend Pages

- `/login` -> student login
- `/register` -> student account creation
- `/student` -> student portal (lectures, tests, result history)
- `/tests/:slug` -> test landing/start page
- `/tests/:slug/start` -> test runtime UI
- `/tests/:slug/result` -> immediate result page after submit
- `/student/results/:attemptId` -> historical result review page
