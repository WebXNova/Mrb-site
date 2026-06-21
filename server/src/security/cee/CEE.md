# Course Entitlement Engine (CEE) — Protection Grid

## System guarantee

**Without a valid `enrollments.access_status = 'active'` row for the authenticated user, no instructional API or upload file under the protection grid can return course content** — knowing a URL, slug, or test ID is insufficient.

## Architecture (fail-closed grid)

```text
Request → attachRequestContext → JSON/cookies
        → CEE Protection Grid
              → protected namespace + unregistered/public rule? → DENY (403 + audit)
              → public: pass through
              → identity_only: JWT + verified email
              → entitlement: JWT + verified + active enrollment → req.cee
        → Route handler (course-scoped queries only)

Boot → validateProtectionGridAtStartup() — namespaces, mounts, grid labels (see PROTECTION_GRID_FAIL_CLOSED.md)
```

## Route mapping table

| Pattern | Policy | Middleware |
|---------|--------|------------|
| `/api/health` | public | none — liveness only (`{ status: 'ok' }`) |
| `/api/ready` | public | none — readiness probe; component details restricted in production |
| `/api/metrics` | admin_delegated | `requireMetricsAccess` (admin / internal / scraper token) |
| `/api/payments/webhook` | public | none |
| `/api/auth/*` | public | none |
| `/api/admin/*` | public | admin stack (separate) |
| `/api/courses/public`, `/:id`, `/:id/batches` | public | marketing catalog |
| `/api/enrollments/*` | identity_only | JWT + verified |
| `/api/payments/create-session` | identity_only | JWT + verified |
| `/api/student/*` | **entitlement** | identity + enrollment |
| `/api/tests/*` | **entitlement** | identity + enrollment |
| `/api/lectures/*` | **entitlement** | identity + enrollment |
| `/api/uploads/*` | **entitlement** | identity + enrollment + file ACL |
| `/api/results/*` | **entitlement** | identity + enrollment |

## Protected table registry (Phase 1)

`protectedTableRegistry.js` exports immutable `CEE_PROTECTED_TABLES` — the canonical list of instructional stores (courses → uploads) used for DB-level enforcement and SQL guards.

## Modules

| Module | Role |
|--------|------|
| `protectedTableRegistry.js` | Immutable instructional table registry |
| `requireEntitlement.js` | Service: resolve + validate enrollment |
| `identityGuard.js` | JWT/session only (no access grant) |
| `entitlementGuard.js` | Middleware: identity → entitlement → `req.cee` |
| `protectionGrid.js` | Fail-closed path-based guard application |
| `protectedNamespaceRegistry.js` | Immutable instructional API prefixes |
| `protectionGridValidator.js` | Startup mount/grid/registry validation |
| `PROTECTION_GRID_FAIL_CLOSED.md` | Before/after, attacks prevented, testing |
| `scopedQueryGuard.js` | DB enforcement: intercept protected tables, require `course_id`, audited bypass |
| `audit/securityAuditLogger.js` | Unified SIEM audit sink (`cee.security.audit`) |
| `audit/entitlementAudit.js` | Entitlement failure logging |
| `bypass/bypassPolicy.js` | Audited bypass validation (admin_job / analytics / migration only) |
| `bypass/bypassAuditLogger.js` | Bypass events → unified audit logger |
| `diagnostics/violationReporter.js` | Dev-visible violation banners + SIEM JSON + optional production audit |
| `db/scopedQuery.js` | Safe DB wrapper factory — all instructional SQL goes through `scopedQuery()` |
| `db/ceeQueryContext.js` | AsyncLocalStorage validated query context for pool guard |
| `ownership/ownershipValidation.js` | Service-layer entitlement + object ownership |
| `DB_DATA_BOUNDARY.md` | DB boundary architecture, migration phases, testing |
| `config/mysqlGuard.js` | Production pool guard on protected tables |
| `SCOPED_QUERY_MIGRATION.md` | Raw → scopedQuery migration guide, before/after, CI audit |
| `testEntitlement.service.js` | Course-bound test resolution (no global slug lookup) |
| `secureMedia.service.js` | Controlled file streaming (no `express.static`) |

## Test hardening

1. Grid requires entitlement on all `/api/tests/*` routes (including attempt JWT routes).
2. `resolveEntitledTestBySlug(slug, entitledCourseId)` — SQL requires `course_id = ?`.
3. Orphan tests (`course_id IS NULL`) → `OrphanTestAccessDeniedError` (403).
4. Attempt rows bound to `user_id`; nonce rotation checks `course_id` match.

## Media protection flow

```text
GET /api/uploads/:namespace/:filename
  → CEE grid policy (entitlement | question_bank_media | …)
  → assertMediaAccess(userId, namespace, filename)
  → student-qa: filename must start with {userId}-
  → question-bank: filename must match /^[a-f0-9]{48}\.(jpg|png|webp)$/i
      staff (admin|teacher): allowStaffRead
      students: requireEntitlement
  → stream file (private, no-store; no filesystem paths in responses)
```

## Phase 2 TODOs

- Admin UI: require `courseId` when creating/publishing tests.
- Backfill `tests.course_id` for legacy rows.
- `enrollments.access_expires_at` + scheduled revocation.
- DB partial unique index: one `active` enrollment per user.
