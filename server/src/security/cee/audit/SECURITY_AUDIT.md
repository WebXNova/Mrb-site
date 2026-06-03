# CEE Security Audit Logging

Unified structured audit stream for Course Entitlement Engine enforcement — traceable for incident response and SIEM ingestion.

## Architecture

```text
                    ┌─────────────────────────────┐
                    │  emitSecurityAuditEvent()   │
                    │  (securityAuditLogger.js)   │
                    └──────────────┬──────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
  violationReporter          bypassAuditLogger        entitlementAudit
  (scope violations)         (scope bypass)           (entitlement failures)
         │                         │                         │
         └─────────────────────────┴─────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
            stdout JSON line              activity_logs (optional)
            tag: cee.security.audit       CEE_SECURITY_AUDIT_PERSIST
```

**Low overhead:** synchronous `JSON.stringify` + `console.info`; DB persist is async fire-and-forget when enabled.

## Log schema (`cee.security.audit.1`)

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | string | `cee.security.audit.1` |
| `tag` | string | `cee.security.audit` (SIEM filter) |
| `timestamp` | ISO-8601 | Event time |
| `action` | string | Stable action id (see below) |
| `violationType` | string | Taxonomy for alerts |
| `outcome` | string | `denied` \| `bypass` \| `failure` \| `allowed` |
| `severity` | string | `critical` \| `high` \| `medium` \| … |
| `reason` | string \| null | Bypass reason, denial cause, or error hint |
| `route` | string \| null | `GET /api/student/dashboard` (sanitized) |
| `userId` | number \| null | Authenticated user when known |
| `requestId` | string \| null | Correlation id |
| `courseId` | number \| null | Entitled course when known |
| `context` | string | Caller label (`studentPortal.loadLectures`) |
| `tables` | string[] | Protected MySQL tables touched |
| `registryKeys` | string[] | CEE registry keys |
| `sqlSnippet` | string \| null | Truncated SQL (240 chars), **no bind params** |
| `errorCode` | string \| null | Machine code (`CEE_UNSCOPED_QUERY_DENIED`, etc.) |
| `category` | string \| null | Bypass category (`admin_job`, …) |
| `environment` | string | `NODE_ENV` |

## Actions & violation types

| Event | `action` | `violationType` |
|-------|----------|-----------------|
| Unscoped protected SQL | `scope.unscoped_query_attempt` | `UNSCOPED_PROTECTED_QUERY` |
| Missing courseId | `scope.missing_course_scope` | `MISSING_COURSE_SCOPE` |
| Bypass used | `scope.bypass` | `SCOPE_BYPASS` |
| Bypass rejected | `scope.bypass_denied` | `BYPASS_DENIED` |
| Entitlement denied | `entitlement.failure` | `ENTITLEMENT_FAILURE` |
| Dev-only allowed query | `scope.allowed` | `SCOPE_ALLOWED` |

## Environment flags

| Variable | Default | Effect |
|----------|---------|--------|
| (none) | — | **Always** emit JSON to stdout for security events |
| `CEE_SECURITY_AUDIT_STDOUT=false` | off | Disable stdout (not recommended prod) |
| `CEE_SECURITY_AUDIT_PERSIST=true` | off | Write `activity_logs` in production |
| `CEE_VIOLATION_PRODUCTION_AUDIT=true` | off | Legacy alias for persist |

Development: violation dev banners remain separate (`violationReporter`); bypass dev warning via `devConsole`.

## Audit event examples

### Unscoped query attempt

```json
{
  "schemaVersion": "cee.security.audit.1",
  "tag": "cee.security.audit",
  "timestamp": "2026-05-29T19:00:00.000Z",
  "action": "scope.unscoped_query_attempt",
  "violationType": "UNSCOPED_PROTECTED_QUERY",
  "outcome": "denied",
  "severity": "high",
  "reason": "Protected instructional SQL must include course_id = ? ...",
  "route": "GET /api/student/dashboard",
  "userId": 42,
  "requestId": "req-abc",
  "courseId": 7,
  "context": "studentPortal.loadLectures",
  "tables": ["lectures"],
  "registryKeys": ["lectures"],
  "sqlSnippet": "SELECT id FROM lectures WHERE is_active = TRUE",
  "errorCode": "CEE_UNSCOPED_QUERY_DENIED",
  "category": null,
  "environment": "production"
}
```

### Bypass usage

```json
{
  "action": "scope.bypass",
  "violationType": "SCOPE_BYPASS",
  "outcome": "bypass",
  "severity": "high",
  "reason": "admin_job:tests_global_inventory_v2",
  "context": "admin.tests.listAll",
  "tables": ["tests"],
  "category": "admin_job"
}
```

### Entitlement failure

```json
{
  "action": "entitlement.failure",
  "violationType": "ENTITLEMENT_FAILURE",
  "outcome": "failure",
  "severity": "high",
  "reason": "missing_user_id",
  "route": "GET /api/student/dashboard",
  "userId": null,
  "context": "cee.entitlementGuard",
  "tables": [],
  "errorCode": "ENROLLMENT_NOT_FOUND"
}
```

## Integration examples

### Direct emit (custom subsystem)

```js
import { emitSecurityAuditEvent } from '../security/cee/audit/securityAuditLogger.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../security/cee/audit/auditSchema.js';

emitSecurityAuditEvent({
  action: CEE_AUDIT_ACTIONS.PROTECTED_TABLE_VIOLATION,
  violationType: CEE_AUDIT_VIOLATION_TYPES.PROTECTED_TABLE_ACCESS,
  outcome: 'denied',
  reason: 'direct_file_access_blocked',
  context: 'secureMedia.assertAccess',
  route: 'GET /api/uploads/student-qa/file.png',
  userId: 42,
  tables: ['uploads'],
});
```

### Scope violations (automatic)

```js
// scopedQueryGuard → violationReporter → emitSecurityAuditEvent
validateScopedQuery({ sql, courseId, context, route, userId });
```

### Bypass (automatic)

```js
// logBypassEvent → emitSecurityAuditEvent
scopedQueryBypass({ reason: 'migration:backfill_v1', context: 'migration.tests.backfill' });
```

### Entitlement middleware

```js
// entitlementGuard catch → auditEntitlementFailure
export async function entitlementGuard(req, res, next) {
  try {
    // ...
  } catch (error) {
    auditEntitlementFailure(error, req, { context: 'cee.entitlementGuard' });
    return next(error);
  }
}
```

## SIEM recommendations

- **Filter:** `tag = "cee.security.audit"`
- **Alerts:** `violationType IN (UNSCOPED_PROTECTED_QUERY, MISSING_COURSE_SCOPE)` AND `environment = production`
- **Bypass review:** `action = scope.bypass` grouped by `reason` / `userId`
- **Never index:** raw SQL params, JWT, cookies (not present in schema)

## Related modules

- `audit/securityAuditLogger.js` — core sink
- `audit/entitlementAudit.js` — entitlement error mapping
- `diagnostics/violationReporter.js` — dev banners + scope violations
- `bypass/bypassAuditLogger.js` — bypass delegate
