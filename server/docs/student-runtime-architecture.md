# Student Test Runtime Architecture

**Status:** G-RT-01 groundwork + G-RT-02 legacy deprecation (2026-06-11)

## Canonical stacks

| Stack | Prefix | Purpose | CEE entitlement |
|-------|--------|---------|-----------------|
| **Slug** | `/api/tests/:slug/*` | Primary take-test flow (instructions → start → save → submit) | Yes |
| **Portal** | `/api/student/*` | Dashboard listing, attempt load/save (partial), **results** | Yes |
| **Legacy** | `/api/attempt`, `/api/attempts` | **Deprecated — 410 by default** | Yes (G-RT-02) |

Public discovery (no auth): `GET /api/courses/public/tests/:slug`

## Canonical route map

| Operation | Method | Path | Stack |
|-----------|--------|------|-------|
| Public meta | GET | `/api/courses/public/tests/:slug` | Slug (public) |
| Prep | GET | `/api/tests/:slug/prep` | Slug |
| Start / resume | POST | `/api/tests/:slug/verify-code` | Slug |
| Load attempt | GET | `/api/tests/:slug/attempts/:attemptId/start` | Slug |
| Save answer | PATCH | `/api/tests/:slug/attempts/:attemptId/answers` | Slug |
| Submit | POST | `/api/tests/:slug/attempts/:attemptId/submit` | Slug |
| Slug result (attempt JWT) | GET | `/api/tests/:slug/attempts/:attemptId/result` | Slug |
| List tests | GET | `/api/student/tests` | Portal |
| Portal start | POST | `/api/student/tests/:testId/start` | Portal |
| Portal load | GET | `/api/student/attempts/:attemptId` | Portal |
| Portal save | POST | `/api/student/attempts/:attemptId/answer` | Portal |
| **Result (preferred)** | GET | `/api/student/results/:attemptId` | Portal |

Source of truth in code: `src/runtime/studentRuntimeCanonical.js`

## Legacy migration (G-RT-02)

| Legacy (disabled) | Canonical replacement |
|-------------------|----------------------|
| `GET /api/attempt/tests/:testId/active` | `POST /api/tests/:slug/verify-code` |
| `GET /api/attempt/:attemptId` | `GET /api/tests/:slug/attempts/:attemptId/start` |
| `POST /api/attempts/:attempt_id/answers` | `PATCH /api/tests/:slug/attempts/:attemptId/answers` |
| `POST /api/attempts/:attempt_id/submit` | `POST /api/tests/:slug/attempts/:attemptId/submit` |
| `GET /api/attempts/:attempt_id/result` | `GET /api/student/results/:attemptId` |

### Default behavior

- All legacy paths return **410 Gone** with `LEGACY_STUDENT_RUNTIME_DISABLED` and a migration payload.
- Access attempts are logged via `TEST_SECURITY_ACTIONS.LEGACY_ENDPOINT_ACCESS`.

### Emergency rollback

Set `LEGACY_RUNTIME_ALLOW=true` to re-mount legacy routers. **CEE entitlement is still required** via the protection grid (G-RT-02 fix). Use only for short migration windows.

## Security controls by stack (before → after G-RT-02)

| Control | Slug | Portal | Legacy (before) | Legacy (after G-RT-02) |
|---------|------|--------|-----------------|------------------------|
| CEE entitlement | Yes | Yes | **No** | **Yes** (grid) or **410** (default) |
| Enrollment re-check | Yes | Yes | Partial | N/A (410) |
| Attempt token rotation | Yes | No | Static nonce | N/A |
| Result visibility flags | Partial | Partial | Legacy service only | N/A |

## Client routing

- **Take test:** `/tests/:slug` → `/tests/:slug/start` → slug APIs
- **View result:** `/tests/:slug/result` → `GET /api/student/results/:attemptId` (portal, CEE)
- Do **not** call `/api/attempts/:id/result`

## Verification

```bash
npm run test:student-runtime-unification
npm run test:protection-grid
```

## Next steps (G-RT-01 continuation)

1. Remove `LEGACY_RUNTIME_ALLOW` after monitoring period
2. Delete legacy attempt/answer/submit/result modules
3. Unify portal submit with slug submit service
4. Enforce single result API with visibility rules
