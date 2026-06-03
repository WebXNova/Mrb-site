# CEE Scoped Query Bypass Policy

Bypass is an **audited exception**, not a convenience shortcut. Unscoped reads of protected instructional tables are denied by default.

## Requirements (all mandatory)

| Field | Rule |
|-------|------|
| `allowUnscoped` | Must be exactly `true` |
| `reason` | Format: `{category}:{descriptor}` (≥ 12 chars total) |
| `context` | Stable caller label; must match category prefix |
| `route` (if HTTP) | Must **not** be student/public entitlement APIs |

Aliases: `bypassReason` is accepted as an alias for `reason`.

## Allowed categories

| Category | Reason prefix | Context prefix examples |
|----------|---------------|-------------------------|
| `admin_job` | `admin_job:` | `admin.tests.listAll`, `admin.lectures.export` |
| `analytics` | `analytics:` | `analytics.enrollments.daily`, `admin.reports.tests` |
| `migration` | `migration:` | `migration.phase3.backfill`, `job.nightly.sync` |

### Reason format

```text
admin_job:tests_global_inventory_2026q2
analytics:completion_rates_by_course_v3
migration:backfill_tests_course_id_batch_01
```

- Descriptor after `:` must be ≥ 8 characters, lowercase alphanumeric + `_` `.` `-`
- Placeholder reasons (`test`, `fix`, `temp`) are rejected by length/pattern rules

## Forbidden (fail-closed)

### HTTP routes (protection grid)

Bypass is **denied** when `route` matches:

- `/api/student/*` (entitlement)
- `/api/tests/*`, `/api/lectures/*`, `/api/uploads/*`, `/api/results/*`
- Public course catalog routes

Use **course-scoped** `scopedQueryFromRequest(req, context)` on these paths.

### Context prefixes

| Prefix | Why forbidden |
|--------|----------------|
| `studentPortal.` | Student instructional |
| `student.` | Student API |
| `testAttempt.` | Entitled test flow |
| `testEntitlement.` | Slug resolution |
| `public*` | Public handlers |
| `entitlement.` | Entitlement service |
| `secureMedia.` | Use entitlement guard, not SQL bypass |

### API factories

- `scopedQueryFromRequest()` — **never** accepts bypass
- `scopedQueryBypass()` — for jobs/admin modules only

## Secure usage examples

### Admin global test list (batch / admin service)

```js
import { scopedQueryBypass } from '../security/cee/db/scopedQuery.js';

const db = scopedQueryBypass({
  reason: 'admin_job:tests_dashboard_inventory_v2',
  context: 'admin.tests.listAll',
  userId: adminUserId,
});

const tests = await db.rows(`SELECT id, title, course_id FROM tests ORDER BY created_at DESC`);
```

### One-off migration script

```js
import { scopedQueryBypass } from '../security/cee/db/scopedQuery.js';

const db = scopedQueryBypass({
  reason: 'migration:backfill_tests_course_id_2026q1',
  context: 'migration.tests.backfillCourseId',
  userId: null,
});

await db.execute(
  `UPDATE tests SET course_id = ? WHERE id = ? AND course_id IS NULL`,
  [targetCourseId, testId]
);
```

### Analytics report (scheduled job)

```js
const db = scopedQueryBypass({
  reason: 'analytics:published_tests_per_course_daily',
  context: 'analytics.tests.dailyPublishedCount',
  userId: null,
});

const rows = await db.rows(
  `SELECT course_id, COUNT(*) AS n FROM tests WHERE status = 'published' GROUP BY course_id`
);
```

### Student dashboard (correct — no bypass)

```js
import { scopedQueryFromRequest } from '../security/cee/db/scopedQuery.js';

const db = scopedQueryFromRequest(req, 'studentPortal.loadLectures');
const lectures = await db.rows(
  `SELECT id, title FROM lectures WHERE course_id = ?`,
  [db.courseId]
);
```

## Denied examples

```js
// DENIED — student route
scopedQueryBypass({
  reason: 'admin_job:hack',
  context: 'admin.tests.list',
  route: 'GET /api/student/dashboard',
});

// DENIED — student context
scopedQueryBypass({
  reason: 'admin_job:hack',
  context: 'studentPortal.loadTests',
});

// DENIED — invalid reason format
scopedQuery({
  allowUnscoped: true,
  reason: 'just fixing something',
  context: 'admin.tests.list',
});

// DENIED — bypass via request factory
scopedQueryFromRequest(req, 'studentPortal.x'); // allowUnscoped not possible
```

## Audit logging

Every bypass emits:

1. **SIEM JSON** — `tag: "cee.bypass.audit"`, `schemaVersion: "cee.bypass.policy.1"`
2. **activity_logs** — action `cee.scope.bypass`
3. **Dev warning** — `console.warn` banner when `NODE_ENV !== 'production'`

### Example log line

```json
{
  "schemaVersion": "cee.bypass.policy.1",
  "tag": "cee.bypass.audit",
  "timestamp": "2026-05-29T18:00:00.000Z",
  "outcome": "bypass",
  "severity": "high",
  "category": "admin_job",
  "reason": "admin_job:tests_global_inventory_v2",
  "context": "admin.tests.listAll",
  "route": null,
  "userId": 1,
  "touchedTables": ["tests"],
  "registryKeys": ["tests"],
  "sqlSnippet": "SELECT id, title FROM tests ORDER BY created_at DESC",
  "environment": "development"
}
```

## Errors

| Error | Code | When |
|-------|------|------|
| `CeeInvalidBypassError` | `CEE_INVALID_BYPASS` | Missing/short/malformed reason |
| `CeeBypassDeniedError` | `CEE_BYPASS_DENIED` | Student/public route or forbidden context |

## Policy module

- `bypass/bypassPolicy.js` — validation
- `bypass/bypassAuditLogger.js` — structured audit
- Wired in `scopeContext.js` (construction-time) and `validateScopedQuery()` (per-query)
