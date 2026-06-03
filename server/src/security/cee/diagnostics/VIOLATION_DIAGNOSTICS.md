# CEE Security Violation Diagnostics

Developer-facing diagnostics for unscoped LMS queries against protected instructional tables.

## Goals

- **No silent violations** — every deny path reports before throwing
- **No sensitive leakage** — SQL truncated, no bind params, paths sanitized via `logSanitizer`
- **SIEM-ready** — single JSON line with stable `schemaVersion` and `tag`

## Environment flags

| Variable | Default | Effect |
|----------|---------|--------|
| `NODE_ENV=development` | — | Loud `console.error` banner + stack trace + SIEM JSON to stdout |
| `CEE_VIOLATION_DEV_ALWAYS=true` | off | Force dev diagnostics when `NODE_ENV=production` (staging) |
| `CEE_VIOLATION_PRODUCTION_AUDIT=true` | off | Persist violations to `activity_logs` + SIEM JSON in production |

## Violation types

| Type | When |
|------|------|
| `MISSING_COURSE_SCOPE` | `courseId` null/invalid before protected SQL runs |
| `UNSCOPED_PROTECTED_QUERY` | SQL touches protected tables without `course_id` / join-path scope |

## Structured record (`cee.violation.1`)

```json
{
  "tag": "cee.violation.report",
  "schemaVersion": "cee.violation.1",
  "timestamp": "2026-05-29T12:00:00.000Z",
  "severity": "high",
  "violationType": "UNSCOPED_PROTECTED_QUERY",
  "errorCode": "CEE_UNSCOPED_QUERY_DENIED",
  "context": "studentPortal.loadLectures",
  "route": "GET /api/student/dashboard",
  "userId": 42,
  "requestId": "req-abc",
  "courseId": 7,
  "protectedTables": ["lectures"],
  "registryKeys": ["lectures"],
  "sqlSnippet": "SELECT id, title FROM lectures WHERE is_active = TRUE",
  "hint": "Protected instructional SQL must include course_id = ? ...",
  "environment": "development",
  "stack": "at validateScopedQuery (...)\n..."
}
```

## Example — development console

```text
════════════════════════════════════════════════════════
 CEE SECURITY VIOLATION: UNSCOPED_PROTECTED_QUERY
════════════════════════════════════════════════════════
 context:   studentPortal.loadLectures
 route:     GET /api/student/dashboard
 userId:    42
 courseId:  7
 tables:    lectures
 registry:  lectures
 sql:       SELECT id, title FROM lectures WHERE is_active = TRUE
 hint:      Protected instructional SQL must include course_id = ? ...
 code:      CEE_UNSCOPED_QUERY_DENIED
 time:      2026-05-29T12:00:00.000Z
 stack:
   at validateScopedQuery (scopedQueryGuard.js:...)
   at ScopedQueryRunner.execute (ScopedQueryRunner.js:...)
════════════════════════════════════════════════════════
```

## Integration with `scopedQueryGuard`

Violations are emitted automatically inside `validateScopedQuery()` and `assertCourseScope()` — no manual call required for guarded paths.

### `validateScopedQuery` (raw SQL)

```js
import { validateScopedQuery } from '../security/cee/scopedQueryGuard.js';

validateScopedQuery({
  sql: 'SELECT * FROM lectures WHERE is_active = TRUE',
  courseId: entitlement.courseId,
  context: 'studentPortal.loadLectures',
  route: 'GET /api/student/dashboard',
  userId: req.user.id,
  requestId: req.requestId,
});
// → console banner (dev) + CeeUnscopedQueryDeniedError
```

### `scopedQuery()` (recommended)

```js
import { scopedQueryFromRequest } from '../security/cee/db/scopedQuery.js';

export async function loadDashboard(req) {
  const db = scopedQueryFromRequest(req, 'studentPortal.loadDashboard');
  // route, userId, requestId, courseId flow into guard + diagnostics
  return db.rows(
    'SELECT id, title FROM lectures WHERE course_id = ? AND is_active = TRUE',
    [db.courseId]
  );
}
```

### Missing `courseId` at factory time

```js
import { scopedQuery } from '../security/cee/db/scopedQuery.js';

scopedQuery({ courseId: null, context: 'bad.service.method', userId: 1 });
// → MISSING_COURSE_SCOPE banner + CeeMissingCourseScopeError at construction
```

### Manual report (custom services)

```js
import { reportUnscopedProtectedQueryViolation } from '../security/cee/diagnostics/violationReporter.js';

reportUnscopedProtectedQueryViolation({
  context: 'legacyImporter.syncLectures',
  route: 'job://nightly-sync',
  userId: null,
  protectedTables: ['lectures'],
  sql: 'SELECT * FROM lectures',
});
```

## Logger architecture

```text
validateScopedQuery / assertCourseScope
        │
        ▼
violationReporter.report*()
        ├─ buildViolationRecord()  — sanitize + truncate
        ├─ formatDevBanner()       — NODE_ENV !== 'production'
        ├─ formatSiemPayload()     — JSON line (dev or CEE_VIOLATION_PRODUCTION_AUDIT)
        └─ logActivity()           — production audit only
```

Bypass events continue on `[cee.scope.audit]` (separate channel, not a violation).
