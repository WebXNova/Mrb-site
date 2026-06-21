# Test mutation authority & security audit (PATCH-8/9)

## Authorized shell mutations

| Method | Path | Service |
|--------|------|---------|
| POST | `/admin/tests` | `createTestBasicInfo` |
| PATCH | `/admin/tests/:id/basic-info` | `updateTestBasicInfo` |
| PATCH | `/admin/tests/:id/rules` | `updateTestRules` |
| PATCH | `/admin/tests/:id/settings` | `updateTestSettings` |
| POST | `/admin/tests/:id/publish` | `publishTest` (idempotent — see [test-publish-idempotency.md](./test-publish-idempotency.md)) |

Question composition (separate, validated): link / unlink / reorder under `/admin/tests/:id/questions`.

## Publish idempotency

`POST /admin/tests/:id/publish` returns **200** with the published test when the test is already published (safe replay). Optional `Idempotency-Key` header is supported via `idempotencyMiddleware`.

## Disabled bypass routes

| Method | Path | Response |
|--------|------|----------|
| PUT | `/admin/tests/:id` | 410 `LEGACY_ENDPOINT_DISABLED` |
| PUT | `/admin/tests/:id/publish` | 410 — use POST publish |

## Validation chain

Controllers → services → `testValidation.service.js` / `testPublishEligibility.service.js`

No controller writes SQL directly.

## Security audit

`testSecurityAudit.service.js` → `logSecurityEvent()` → CEE `emitSecurityAuditEvent` + `activity_logs`

```bash
npm run test:security-audit
```
