# G-RT-03 — Test availability window (`start_date` / `end_date`)

Authoritative enforcement lives in `src/services/testAvailabilityWindow.service.js`.

## Phases

| Phase | Used for | Rules |
|-------|----------|-------|
| `any_access` | Prep, preview | Block before `start_date` |
| `create_attempt` | New attempt (slug + portal) | Block before start or after end |
| `in_progress` | Resume, load, save, submit, auto-submit | Block before start; after end allow only if `attempt.started_at <= end_date` |

## Enforcement points

| Operation | Path | Layer |
|-----------|------|-------|
| Prep | `loadTestInstructionsPrep` | `ANY_ACCESS` |
| Attempt create | `createEntitledTestAttempt`, `startOrResumeStudentTest` | `CREATE_ATTEMPT` + SQL `UTC_TIMESTAMP()` guard |
| Attempt resume | Same services | `IN_PROGRESS` with `started_at` |
| Load questions | `resolveSecureAttemptContext` | `IN_PROGRESS` |
| Save answer (slug) | `saveAttemptAnswer` → secure context | `IN_PROGRESS` |
| Save answer (portal) | `saveStudentAttemptAnswer` → `assertAttemptLoadable` | `IN_PROGRESS` |
| Submit / auto-submit | `submitAttempt` → secure context | `IN_PROGRESS` |
| Result read (submitted) | `getAttemptResult` | Window skipped (`requireSubmitted`) |

## UTC

- JS comparisons use `parseTestAvailabilityInstant` (MySQL datetimes treated as UTC).
- Authoritative "now": `getAvailabilityNowMs()` → MySQL `UTC_TIMESTAMP(3)` on **all** enforcement paths (prep, create, resume, load, save, submit).
- INSERT guards use `UTC_TIMESTAMP()` for race-safe DB authority inside transactions.
- Admin writes use `formatMySqlDateTime`; API reads return ISO UTC via `toAvailabilityIso`.
- See `docs/timezone-architecture.md` and `docs/migrations/utc-datetime-migration-notes.md`.

## Tests

```bash
npm run test:availability-window
```
