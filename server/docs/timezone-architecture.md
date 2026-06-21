# UTC Timezone Architecture (Instructional Runtime)

## Standard

| Layer | Format | Semantics |
|-------|--------|-----------|
| Admin API | ISO-8601 with `Z` | Absolute UTC instant |
| MySQL `tests.start_date` / `end_date` | `DATETIME` `YYYY-MM-DD HH:mm:ss` | UTC wall clock (naive) |
| MySQL `test_attempts.started_at` / `expires_at` | `DATETIME` via `UTC_TIMESTAMP()` | UTC wall clock |
| Authoritative "now" | `getAvailabilityNowMs()` → `UTC_TIMESTAMP(3)` | MySQL UTC |
| Student API responses | ISO-8601 with `Z` | UTC instant |
| Student UI display | `toLocaleString()` / `Intl` | Browser-local presentation |

## Data flow

```
Admin datetime-local (local wall)
  → datetimeLocalToIso() → ISO UTC (API)
  → formatMySqlDateTime() → UTC DATETIME (DB)

Student enforcement
  → getAvailabilityNowMs() (MySQL UTC)
  → parseTestAvailabilityInstant() (naive DATETIME = UTC)
  → assertTestAvailabilityWindow({ nowMs })

Student display
  → API ISO UTC → browser local formatting
```

## Modules

| Module | Role |
|--------|------|
| `src/utils/dateTime.js` | `formatMySqlDateTime` — UTC components to MySQL string |
| `src/utils/utcDateTime.js` | Public UTC helpers (parse/serialize/clock) |
| `src/services/testAvailabilityWindow.service.js` | Window enforcement + `getAvailabilityNowMs` |
| `src/services/attemptTiming.service.js` | Timer parsing (UTC-aligned with availability) |

## Enforcement points (single clock)

All paths call `getAvailabilityNowMs` (directly or via `resolveSecureAttemptContext` / `assertAttemptLoadable`):

- `GET /api/tests/:slug/prep`
- `POST /api/tests/:slug/verify-code` (create + resume)
- `GET /api/tests/:slug/attempts/:id/start`
- `PATCH …/answers`, `POST …/submit`
- Portal start / load / save

SQL INSERT guards use `UTC_TIMESTAMP()` — same family as JS `nowMs`.

## Operational checks

```bash
npm run test:utc-datetime
npm run test:availability-window
```

Compare clocks in dev (should differ by &lt; 2s):

```sql
SELECT UTC_TIMESTAMP(3) AS mysql_utc, NOW(3) AS mysql_session;
```

Node should align with `mysql_utc`, not `mysql_session`.

## Fallback

If `UTC_TIMESTAMP(3)` is unparseable, `getAvailabilityNowMs` logs `AVAILABILITY_CLOCK_FALLBACK` and uses `Date.now()`. Monitor this in production logs.
