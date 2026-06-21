# Test publish idempotency (G-05)

`POST /admin/tests/:testId/publish` is safe to retry. Repeated identical requests after a successful publish return **HTTP 200** with the same test payload instead of `409 TEST_IS_LOCKED`.

## Layers

| Layer | Mechanism | Handles |
|-------|-----------|---------|
| **Domain replay** | `lockTestRowForPublish` + `isPublishIdempotentReplay` | Double-clicks, retries after success, concurrent duplicate publishes |
| **Transaction lock** | `SELECT … FOR UPDATE` on `tests` | Two in-flight publishes for the same test (serialized) |
| **Draft materialization** | `materialized_version === draft.version` skip | Re-materialize within same draft version inside one publish attempt |
| **Header replay** (optional) | `Idempotency-Key` + `idempotencyMiddleware` | Clients that supply a stable key across network retries |

Authorization (`assertTestMutationAccess`) runs **before** any transaction — unchanged.

## Domain replay flow

```
POST /publish
  → assertTestMutationAccess (unchanged)
  → BEGIN
  → SELECT tests … FOR UPDATE
  → if status = published:
        COMMIT (no mutation)
        → 200 + test DTO + publishReplay: true
  → else:
        materialize draft → validate → SET published → COMMIT
        → 200 + test DTO
```

## Response shape

First successful publish returns the normal test object.

Idempotent replay adds:

```json
{
  "id": 42,
  "status": "published",
  "publicSlug": "…",
  "publishReplay": true
}
```

Clients may ignore `publishReplay`; it is diagnostic only.

## Error behavior (unchanged)

| Condition | Result |
|-----------|--------|
| Test not found | `404 NOT_FOUND` |
| Not eligible (no draft, invalid MCQ, incomplete wizard) | `400` / `422` per existing publish gates |
| Unauthorized | `403` / `401` per admin stack |
| Already published | **`200` success (replay)** — not `409` |

## Idempotency-Key header

Optional. When present, successful `2xx` responses are cached for 24h in `idempotency_keys` and replayed byte-for-byte. Publish body is `{}`; key must not be reused with a different payload hash on the same endpoint.

## Verification

```bash
npm run test:publish-idempotency
```
