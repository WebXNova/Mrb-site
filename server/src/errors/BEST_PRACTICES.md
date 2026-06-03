# Entitlement Error Architecture — Production Best Practices

## Naming conventions

- **Error classes**: `{Domain}{Outcome}Error` — e.g. `EnrollmentExpiredError`, `MediaAccessDeniedError`
- **Error codes**: `SCREAMING_SNAKE_CASE`, stable forever once shipped — e.g. `ACCESS_EXPIRED`
- **Files**: one domain folder per concern (`entitlement/`, `auth/`, `payment/`, `media/`, `validation/`)
- **Services throw; controllers/middleware catch via global handler** — avoid ad-hoc `res.status().json()` in routes

## Security recommendations

1. **Fail closed** — null entitlement, ambiguous state, or integrity violations must deny content.
2. **Client messages** — safe, non-enumerating where possible; use `metadata` for internal IDs only in logs.
3. **Never expose** — SQL, stack traces, raw webhook bodies, file paths, or internal row shapes in production JSON.
4. **403 vs 404** — entitlement denials use **403** with stable codes; reserve 404 for truly missing public resources.
5. **Integrity errors** (`MULTIPLE_ACTIVE_ENROLLMENTS`, `INVALID_ENTITLEMENT_STATE`) — log at error level; alert ops.

## Logging recommendations

- Use `AppError#toLogPayload({ requestId })` for structured logs.
- **Operational 4xx** (expected auth/entitlement denies): `console.info('[http.error.operational]', …)` — no stack.
- **5xx / non-operational**: `console.error` with full stack and `metadata`.
- Always attach **`requestId`** from `attachRequestContext` middleware.

## Monitoring hooks

- Metric labels: `error_code`, `http_status`, `is_operational`, `route` (sanitized).
- Alert on rate spikes for: `MULTIPLE_ACTIVE_ENROLLMENTS`, `INVALID_ENTITLEMENT_STATE`, `INTERNAL_ERROR`.
- Dashboard entitlement denials: `ACCESS_EXPIRED`, `ACCESS_REVOKED`, `COURSE_ACCESS_MISMATCH`.

## Observability

- Correlate payment webhooks → enrollment activation → first successful `assertCourseAccess` via shared `requestId` / `userId` in metadata.
- Future: ship `toLogPayload()` to OpenTelemetry as exception attributes.

## Scalability

- Keep entitlement resolution in **`entitlement.service.js`** — single place to add caching (Redis) later.
- Error classes are stateless — safe across horizontal replicas.
- `ErrorCodes` constants prevent string drift across services.

## Future-proofing

1. Wire **`studentPortal.service.js`**, tests, and media routes through `assertCourseAccess`.
2. Migrate legacy `ApiError` throws to `AppError` subclasses incrementally; bridge remains in `normalizeError`.
3. Add `expires_at` on enrollments; `entitlement.service.js` already checks `expiresAt` when present.
4. i18n: map `error.code` → locale strings on the client; keep English `message` as fallback.
5. Replace `express.static` uploads with signed URLs throwing `MediaAccessDeniedError`.

## Integration checklist (next phases)

- [ ] `GET /api/student/dashboard` → `resolveActiveEntitlement` + filter by `courseId`
- [ ] Lecture/test queries → `assertCourseAccess(userId, courseId)` per resource
- [ ] Upload download handler → `MediaAccessDeniedError` / entitlement check
- [ ] Auth middleware → optionally throw `AuthRequiredError` instead of legacy `ApiError`
- [ ] Payment fulfillment → on integrity failure, log `MultipleActiveEnrollmentsError` metadata
