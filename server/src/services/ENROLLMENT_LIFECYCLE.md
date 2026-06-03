# Enrollment Lifecycle — Application-Enforced Integrity

## Problem solved

MySQL triggers (`cee_enrollments_one_active_per_user`) fail on managed/shared hosting with binary logging (`ER_BINLOG_CREATE_ROUTINE_NEED_SUPER`). **Triggers are removed entirely.**

## Business rule

- At most **one** `enrollments` row per `user_id` with `access_status = 'active'`.
- `access_status = 'active'` is the CEE entitlement source of truth.
- All mutations go through **`enrollmentLifecycle.service.js`** — no scattered `UPDATE access_status`.

## Architecture

```text
Payment webhook / Admin approval / Manual ops
        ↓
activateEnrollment() | deactivateEnrollment() | revokeEnrollment()
        ↓
BEGIN TRANSACTION
  SELECT target enrollment FOR UPDATE
  SELECT active enrollments for user FOR UPDATE
  validateActivationEligibility()
  UPDATE others → inactive
  UPDATE target → active (+ approved, order_id)
  assertExactlyOneActiveEnrollment()
COMMIT (or ROLLBACK + audit on failure)
```

## Concurrency strategy

| Mechanism | Purpose |
|-----------|---------|
| `FOR UPDATE` on target row | Serializes duplicate webhook / double-click on same enrollment |
| `FOR UPDATE` on all active rows for user | Serializes competing activations across enrollments |
| Single transaction | No partial deactivate-without-activate state |
| Post-commit integrity assert | Fail-closed if count ≠ 1 (rolls back) |
| Idempotent activation | Safe duplicate webhook when already sole active |

No triggers, no SUPER, no `log_bin_trust_function_creators`.

## API

| Function | Use |
|----------|-----|
| `activateEnrollment(options)` | Owns transaction unless `connection` passed |
| `activateEnrollmentInTransaction(connection, options)` | Payment webhook (existing tx) |
| `deactivateEnrollment({ userId, exceptEnrollmentId? })` | Manual / migration |
| `revokeEnrollment({ enrollmentId })` | Admin reject / revoke |
| `dropLegacyEnrollmentTriggers(pool)` | Startup cleanup only |

## Code paths audited

| File | Before | After |
|------|--------|-------|
| `payments.service.js` | Inline `UPDATE access_status` | `activateEnrollmentInTransaction` |
| `safepayEnrollment.service.js` | `updateEnrollmentStatus` — status only on approve | `activateEnrollment` on approve |
| `enrollment.service.js` | Legacy — no `access_status` | Unchanged (legacy flow; no activation) |
| `ensureCeeDbConstraints.js` | CREATE TRIGGER | DROP legacy triggers only |
| `entitlement.service.js` | Read-only active rows | Unchanged (read path) |

## Security audit

Events via `enrollmentLifecycleAudit.js` → `cee.security.audit`:

- `enrollment.activated`
- `enrollment.deactivated`
- `enrollment.revoked`
- `enrollment.integrity_violation`

Fields: `userId`, `courseId`, `enrollmentId` (in reason), `timestamp`, `action`, `result`.

## Migration steps

1. Deploy code (triggers no longer created).
2. On boot, `ensureCeeDbConstraints` runs `DROP TRIGGER IF EXISTS` (best-effort).
3. Manually run optional drops in `cee_db_constraints.sql` if DROP on boot lacks permission.
4. Verify: `npm run test:enrollment-lifecycle`.

## Testing

```bash
npm run test:enrollment-lifecycle
```

Integration (with DB):

- Pay webhook twice → second idempotent, one active row.
- Admin approve after paid → `access_status = active`.
- Concurrent activation simulation → one winner, integrity holds.

Unit (no DB):

- Validation rejects revoked / unpaid / inactive course.
- SQL SET clause builder for order_id optional path.
