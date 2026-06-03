# Test Attempt Service — CEE Security Boundary

## Architecture

```text
HTTP (entitlementGuard) → controller (thin) → testAttempt.service.js
                              ↓
                    resolveSecureAttemptContext()
                    (assertCourseAccess + ownership + course + slug + state)
                              ↓
                    scopedQuery (scopedQueryGuard on every instructional SQL)
```

The service **does not trust** controller checks. Every operation re-validates entitlement and attempt ownership.

## Module: `secureAttemptContext.js`

| Export | Role |
|--------|------|
| `resolveSecureAttemptContext` | Central resolver — fail-closed |
| `createAttemptScopedQuery` | Bound `scopedQuery` runner |
| `assertQuestionBelongsToAttempt` | Question ∈ entitled test |

## Error codes

`ATTEMPT_NOT_OWNED`, `COURSE_SCOPE_VIOLATION`, `ENTITLEMENT_REQUIRED`, `ATTEMPT_TOKEN_INVALID`, `ATTEMPT_EXPIRED`, `ATTEMPT_INVALID_STATE`, `TEST_NOT_ACCESSIBLE`

## Nonce / replay

- `consumeAttemptNonce` validates nonce + rotates (per HTTP request)
- Subsequent service calls in the **same** request do not re-check nonce (already consumed)

## Verification

```bash
npm run test:secure-attempt
```
