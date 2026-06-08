# Student Test Listing API (Phase 1C + 1D)

## Endpoint

`GET /api/student/tests`

**Auth:** JWT student session + verified email + active enrollment (CEE entitlement grid).

**Query parameters:**

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `page` | integer ≥ 1 | 1 | — |
| `limit` | integer ≥ 1 | 20 | 50 |

## Architecture

```text
Student (JWT)
  → enrollments.access_status = 'active'
  → courses.is_active = 1
  → tests.status = 'published' AND deleted_at IS NULL
  → LEFT JOIN test_attempts aggregate (per student)
  → status: available | in_progress | completed
  → paginated response
```

## Status rules (Phase 1D)

| Status | Condition |
|--------|-----------|
| `in_progress` | Active attempt exists (`test_attempts.status = 'in_progress'`) |
| `completed` | `attempts_used >= max_attempts` (and not in progress) |
| `available` | Can start a new attempt |

Priority: **in_progress** > **completed** > **available**

When `max_attempts = 0` (unlimited), `attempts_remaining` is `null` and status is never `completed` from attempt caps.

## Response schema

Each item:

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | Test id |
| `title` | string | |
| `duration_minutes` | number | |
| `max_attempts` | number | |
| `passing_percentage` | number | |
| `status` | enum | `available` \| `in_progress` \| `completed` |
| `active_attempt_id` | number \| null | Set only when `status = in_progress` |
| `attempts_used` | number | All attempts for this student on this test |
| `attempts_remaining` | number \| null | `max(0, max_attempts - attempts_used)`; `null` if unlimited |

## Example responses

### Success with status (200)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 15,
        "title": "Biology Mock Test",
        "duration_minutes": 60,
        "max_attempts": 3,
        "passing_percentage": 40,
        "status": "in_progress",
        "active_attempt_id": 44,
        "attempts_used": 1,
        "attempts_remaining": 2
      },
      {
        "id": 12,
        "title": "Chemistry Quiz",
        "duration_minutes": 30,
        "max_attempts": 2,
        "passing_percentage": 50,
        "status": "completed",
        "active_attempt_id": null,
        "attempts_used": 2,
        "attempts_remaining": 0
      },
      {
        "id": 8,
        "title": "Physics Intro",
        "duration_minutes": 45,
        "max_attempts": 1,
        "passing_percentage": 40,
        "status": "available",
        "active_attempt_id": null,
        "attempts_used": 0,
        "attempts_remaining": 1
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 3,
      "total_pages": 1
    }
  }
}
```

## Performance considerations

1. **No N+1** — attempt counts and active attempt id come from one `LEFT JOIN` subquery grouped by `test_id`.
2. **Two queries per request** — `COUNT(*)` for pagination + paginated list with join (same as Phase 1C).
3. **Index use** — aggregate subquery filters `test_attempts` by `user_id` / `student_id` (`idx_user`, `idx_student`); join to tests uses `idx_test`.
4. **Pagination** — `LIMIT`/`OFFSET` on tests keeps joined row count bounded (max 50).
5. **Race conditions** — listing is read-only and eventually consistent; start-test flow (Phase 2) must re-check limits atomically with `FOR UPDATE` / transaction.

Optional future index: `(user_id, test_id)` or `(user_id, test_id, status)` on `test_attempts` if aggregate becomes hot.

## Security review

| Control | Implementation |
|---------|----------------|
| JWT required | `enforcePolicy({ auth: 'student', verified: true })` on router |
| Entitlement required | CEE grid policy `entitlement` on `/api/student/*` |
| Course isolation | SQL joins `enrollments` on `course_id` |
| Attempt scoping | Aggregates filter `(user_id = ? OR student_id = ?)` — authenticated student only |
| No cross-student leakage | Never accepts student id from query/body |
| Unpublished/deleted hidden | Unchanged Phase 1C filters |
| Parameterized SQL | All ids bound as `?` |
| No attempt answers/scores | Listing never selects `student_answers` or `test_results` |

## Files

| Layer | Path |
|-------|------|
| Route | `src/routes/student.routes.js` |
| Controller | `src/controllers/studentTests.controller.js` |
| Service | `src/services/studentTestListing.service.js` |
| Status logic | `src/services/studentTestListingStatus.js` |
| SQL | `src/services/studentTestListing.queries.js` |
| DTO / schema | `src/dto/studentTestList.dto.js` |
| Validation | `src/validators/studentTestList.schema.js` |

## Verification

```bash
npm run test:student-test-listing
```
