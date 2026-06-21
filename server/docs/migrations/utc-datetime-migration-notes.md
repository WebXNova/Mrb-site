# Migration notes: UTC datetime standard

## What changed

1. **Authoritative clock** — All test availability checks use MySQL `UTC_TIMESTAMP(3)` via `getAvailabilityNowMs()`, not Node `Date.now()`.
2. **Admin test settings writes** — `start_date` / `end_date` stored with `formatMySqlDateTime()` (UTC wall) instead of mysql2 `Date` bind (session-local wall).
3. **Admin test settings reads** — API returns ISO UTC via `toAvailabilityIso()` (naive DATETIME interpreted as UTC).
4. **Attempt expiry SQL** — `expires_at < UTC_TIMESTAMP()` (was `NOW()`).
5. **Attempt timer parsing** — `parseMySqlDateTimeToMs` uses UTC semantics (aligned with availability).
6. **Slug runtime API** — `startedAt` / `expiresAt` returned as ISO UTC on verify-code and `/start`.

## Backwards compatibility

### Published tests — no schema migration required

Existing `tests.start_date` / `end_date` values remain in place. Runtime now **consistently interprets** naive `DATETIME` as UTC (G-RT-03).

### Data written before this change

Previously, admin saves used:

```javascript
new Date(isoUtc) → mysql2 bind → session-local DATETIME wall
```

On a server in PKT (UTC+5), an admin intent of `2026-06-12T19:42:00.000Z` could be stored as `2026-06-12 19:42:00` (local wall) while meaning 14:42 UTC.

**After this change**, that same DB value is enforced as **19:42 UTC** — effectively shifting the window by the old server offset.

### Recommended admin action

For tests created/edited **before** this deployment on non-UTC servers:

1. Open **Settings** for each published test with availability windows.
2. Review start/end times (form shows local time from corrected ISO read).
3. **Save** once — re-persists via `formatMySqlDateTime` (UTC-correct).

No bulk SQL migration is required unless many tests were affected; optional audit query:

```sql
SELECT id, title, start_date, end_date, updated_at
FROM tests
WHERE start_date IS NOT NULL OR end_date IS NOT NULL
ORDER BY updated_at ASC;
```

Re-save tests with `updated_at` before deployment date.

### Attempt timestamps

Attempts created with `UTC_TIMESTAMP()` were already UTC. Expiry comparison now uses `UTC_TIMESTAMP()` consistently — **no row migration**.

## Rollback

Revert code only; DB values are not destroyed. Reverted code may reintroduce clock skew between prep and verify-code.

## Verification after deploy

1. Set a test window starting in ~5 minutes (admin local time).
2. Confirm prep and verify-code agree (both allow or both deny at the same instant).
3. Run `npm run test:availability-window` and `npm run test:utc-datetime` in CI.
