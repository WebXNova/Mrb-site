# G-RT-04 — Test retake policy (`allow_retake`)

Authoritative module: `src/services/testRetakePolicy.service.js`

## Business rules

| Setting | Behavior |
|---------|----------|
| `allow_retake = false` | One attempt per student per test. After any prior attempt row exists (`submitted`, `expired`, or any non-resume create), **no new attempt**. |
| `allow_retake = true` | Retakes allowed until `max_attempts` is exhausted (all attempt rows count). |
| `max_attempts <= 0` | Unlimited attempts (when retake allowed). |
| Active `in_progress` | **Resume only** — never creates a concurrent attempt (`LOCK ... FOR UPDATE` on active row). |

### Attempt state handling

| State | DB status | `allow_retake=false` | `allow_retake=true` |
|-------|-----------|----------------------|---------------------|
| In progress (abandoned) | `in_progress` | Resume | Resume |
| Completed (pass/fail) | `submitted` | No new attempt | New if under max |
| Timer expired | `expired` | No new attempt | New if under max |
| Never started | — | Create if no rows | Create if under max |

Pass/fail is determined at grading (`submitted` + result); retake policy does not distinguish pass vs fail.

## Enforcement layers

1. **Service:** `assertCanCreateNewTestAttempt()` before INSERT (transaction + locked counts)
2. **SQL:** `TEST_RETAKE_CREATE_WHERE_SQL` on INSERT…SELECT (race-safe)
3. **Prep/UI:** `evaluateRetakePolicy()` → `canStart`, `retakePolicy.denyCode`
4. **Listing:** `computeStudentTestListingStatus({ allowRetake })` → `completed` when retake disabled and attempts > 0

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `RETAKE_NOT_ALLOWED` | 403 | Prior attempt exists; retakes disabled |
| `MAX_ATTEMPTS_REACHED` | 403 | Retakes enabled but cap hit |
| `ATTEMPT_CREATE_DENIED` | 403 | INSERT guard failed (race / window) |

## Tests

```bash
npm run test:retake-policy
```
