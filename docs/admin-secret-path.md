# Secret Admin Path — Implementation Report

**Date:** 2026-06-19  
**Status:** Production-ready  
**Configuration key:** `ADMIN_SECRET_PATH` (server-side only)

---

## Summary

The admin panel is no longer reachable through predictable URLs such as `/admin`, `/admin/login`, or `/api/admin/*`. All admin UI and API surfaces are gated behind a secret path segment loaded exclusively from server environment variables. Legacy predictable paths return generic **404 Not Found** without revealing that an admin surface exists.

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_SECRET_PATH` | **Yes** (all environments) | URL-safe segment, minimum 16 characters. Forbidden values include `admin`, `login`, `dashboard`, etc. |
| `ADMIN_SECRET_PATH_PREVIOUS` | No | Comma-separated previous segments during rotation cutover |

**Generate a value:**

```bash
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

**Central modules:**

- Server: `server/src/config/adminSecretPath.config.js`
- Client runtime (HTML injection, not JS bundle): `window.__MRB_ADMIN_SHELL__`
- Client helpers: `client/src/config/adminPaths.js`, `client/src/config/adminShellConfig.js`

---

## Startup Validation

Validated in `validateAdminSecretPathAtStartup()` (called from `server.js` before accepting traffic):

| Check | Behavior |
|-------|----------|
| Missing `ADMIN_SECRET_PATH` | **Process exits** — `ADMIN_SECRET_PATH is required` |
| Segment &lt; 16 characters | **Process exits** — `ADMIN_SECRET_PATH is too short` |
| Forbidden predictable segment | **Process exits** |
| Invalid characters | **Process exits** |
| Production (`validateProductionStartupConfig`) | `ADMIN_SECRET_PATH` listed in required keys |

Startup log (safe — no secret value):

```
[startup] Admin secret path configuration validated { segmentCount: 1, rotationActive: false }
```

---

## Route Architecture

### New admin API mount

All admin APIs mount under:

```
/api/admin/<ADMIN_SECRET_PATH>/...
```

Invalid paths such as `/api/admin/login`, `/api/admin/users`, or `/api/admin/<wrong-secret>/...` return generic **404** via `adminSecretPathGate` middleware (before auth, authorization, or controllers).

### Affected API routes

| Former path | New path |
|-------------|----------|
| `POST /api/auth/login` (admin) | `POST /api/admin/<secret>/auth/login` |
| `POST /api/auth/logout` (admin) | `POST /api/admin/<secret>/auth/logout` |
| `GET /api/auth/me` (admin) | `GET /api/admin/<secret>/auth/me` |
| `GET /api/auth/csrf-session` (admin use) | `GET /api/admin/<secret>/auth/csrf-session` |
| `/api/admin/*` (no secret segment) | **404** |
| `/api/<secret>/*` (legacy direct mount) | **404** |
| `GET /api/courses/admin` | `GET /api/admin/<secret>/courses` |
| `/api/enrollments/admin/*` | `/api/admin/<secret>/enrollments/*` |
| `/api/questions/*` | `/api/admin/<secret>/questions/*` |
| `/api/tests/:id/quiz-draft` | `/api/admin/<secret>/tests/:id/quiz-draft` |
| `/api/admin/dashboard`, `/users`, etc. | **404** (secret segment required) |

### New admin UI routes

| Former path | New path |
|-------------|----------|
| `/admin/login` | `/<secret>/login` |
| `/admin` | `/<secret>` |
| `/admin/courses`, `/admin/tests`, etc. | `/<secret>/courses`, `/<secret>/tests`, etc. |

### Legacy traps (404, no hints)

**Server** (`adminSecretPathGate` middleware — before auth/authorization/controllers):

- `/api/admin` (bare)
- `/api/admin/login`, `/api/admin/users`, `/api/admin/courses`, etc. (no valid secret segment)
- `/api/admin/<wrong-secret>/*`
- `/api/<secret>/*` (legacy direct mount)
- `/api/enrollments/admin/*`, `/api/courses/admin`, `/api/questions/*`, `/api/tests/:id/quiz-draft`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (admin auth relocated)

**Client** (`AppRouter.jsx`):

- `/admin`, `/admin/*` → `NotFoundPage`

---

## Secret Rotation

1. Deploy with new `ADMIN_SECRET_PATH` and set `ADMIN_SECRET_PATH_PREVIOUS` to the old segment.
2. Both segments accept traffic (duplicate Express mounts + CEE grid patterns).
3. Update bookmarks, CI secrets, and HTML shell injection source (`ADMIN_SECRET_PATH` in deploy env).
4. Remove `ADMIN_SECRET_PATH_PREVIOUS` after cutover.

---

## Security Review

| Requirement | Status |
|-------------|--------|
| No fallback/default secrets | ✅ Fail closed if missing |
| No hardcoded secret in source | ✅ Env + HTML injection only |
| Not in JS bundles | ✅ Vite injects into `index.html` only |
| Not in API JSON responses | ✅ No bootstrap endpoint exposes segment |
| Not in error messages | ✅ Generic 404 for legacy paths |
| Not in startup logs | ✅ Logs segment count only |
| Server-side env only | ✅ No `VITE_*` admin path var |
| Cookie auth unchanged | ✅ Cookies remain on `/api` scope |

**Residual exposure:** Anyone who loads the admin login page receives the segment in served HTML (required for SPA routing). This is intentional obscurity as first gate; authentication remains mandatory.

---

## Files Modified

### Server (new)

- `server/src/config/adminSecretPath.config.js`
- `server/src/middleware/adminSecretPathGate.js`
- `server/src/routes/adminAuth.routes.js`
- `server/src/routes/adminCoursesRead.routes.js`

### Server (updated)

- `server/src/app.js`
- `server/src/server.js`
- `server/src/config/env.js`
- `server/src/config/validateProductionStartup.js`
- `server/src/routes/auth.routes.js`
- `server/src/routes/enrollment.routes.js`
- `server/src/routes/courses.routes.js`
- `server/src/security/cee/protectionGrid.js`
- `server/src/security/cee/applicationMountManifest.js`
- `server/src/constants/testMutationAuthority.constants.js`
- `server/.env.example`

### Client (new)

- `client/src/config/adminShellConfig.js`
- `client/src/config/adminPaths.js`
- `client/vite-plugins/adminShellInjection.js`
- `client/scripts/migrate-admin-paths.mjs`

### Client (updated)

- `client/vite.config.js`
- `client/src/routes/AppRouter.jsx`
- `client/src/api/adminApi.js`
- `client/src/api/csrfAttachPolicy.js`
- `client/src/admin/config/adminNavConfig.js`
- `client/src/admin/config/testWizardConfig.js`
- `client/src/admin/components/AdminLayout.jsx`
- `client/scripts/verify-request-client-csrf.mjs`
- All admin pages/components with hardcoded `/admin` navigation (via migration script)

---

## Operations Checklist

1. Set `ADMIN_SECRET_PATH` in production secrets manager (≥ 16 chars).
2. Ensure Vite build / deploy injects the same value into `index.html` (reads `ADMIN_SECRET_PATH` from env or `server/.env` in dev).
3. Access admin at `https://<domain>/<ADMIN_SECRET_PATH>/login`.
4. Verify `/admin` and `/api/admin` return 404.
5. Document the secret path in your internal runbook only — not in public docs or client repos.

---

## Dev Quick Start

`server/.env` must include:

```env
ADMIN_SECRET_PATH=your_generated_segment_here
```

Start API and Vite as usual. Admin login URL:

```
http://localhost:5173/<ADMIN_SECRET_PATH>/login
```
