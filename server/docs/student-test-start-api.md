# Student Test Start API (Phase 2A)

## Endpoint

`POST /api/student/tests/:testId/start`

**Auth:** JWT student + verified email + CEE entitlement (same as `/api/student/*`).

**Body:** none (timer values are server-computed).

## Validation flow

1. Authenticated student (`req.user.id`)
2. Valid `testId` path param
3. Test exists
4. Test is published and not soft-deleted
5. Student authorized (`assertStudentOwnsTest`)
6. Test within `start_date` / `end_date` window (if set)
7. Attempts remaining (`attempts_used < max_attempts`)
8. Resume if `in_progress` attempt exists; otherwise create new attempt

## Transaction strategy

1. `BEGIN`
2. `SELECT tests ... FOR UPDATE` — serialize concurrent starts per test
3. `SELECT test_attempts ... in_progress FOR UPDATE` — resume path
4. `COUNT` attempts + `MAX(attempt_number)+1` with locks
5. `INSERT test_attempts` or commit resume
6. `COMMIT`

On `ER_DUP_ENTRY` (unique `test_id, student_id, attempt_number`): rollback → **409 ATTEMPT_START_CONFLICT**.

## Example responses

### Resume (200)

```json
{
  "success": true,
  "data": {
    "attemptId": 55,
    "isResume": true,
    "startedAt": "2026-06-04T18:00:00.000Z",
    "expiresAt": "2026-06-04T19:00:00.000Z"
  }
}
```

### New attempt (200)

```json
{
  "success": true,
  "data": {
    "attemptId": 56,
    "isResume": false,
    "startedAt": "2026-06-04T20:00:00.000Z",
    "expiresAt": "2026-06-04T21:00:00.000Z"
  }
}
```

### Max attempts (403)

```json
{
  "success": false,
  "error": {
    "code": "MAX_ATTEMPTS_REACHED",
    "message": "Maximum attempts reached for this test"
  }
}
```

## Security review

| Control | Implementation |
|---------|----------------|
| JWT + entitlement | CEE grid + student router policy |
| Ownership | `assertStudentOwnsTest` + enrollment join |
| No client timer | `expires_at = started_at + duration_minutes` (server clock) |
| Duplicate attempts | Active attempt resume + transaction locks + unique key |
| No question leakage | Questions not loaded in this phase |
| Parameterized SQL | All queries use `?` bindings |
| Error opacity | Unknown/unauthorized tests → 404/403 without cross-course hints |

## Files

| Layer | Path |
|-------|------|
| Route | `src/routes/student.routes.js` |
| Controller | `src/controllers/studentTests.controller.js` |
| Service | `src/services/studentTestStart.service.js` |
| SQL | `src/services/studentTestStart.queries.js` |
| Validation | `src/validators/studentTestStart.schema.js` |
| Test ownership | `src/services/testOwnership.service.js` |
| Attempt ownership | `src/services/attemptOwnership.service.js` |

## Verify

```bash
npm run test:student-test-start
```
