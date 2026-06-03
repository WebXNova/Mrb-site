# CEE Protection Grid — Fail-Closed Architecture

## Before (fail-open — vulnerable)

```text
Request → matchProtectionRule(path)
            → no rule?  → next()  ← PUBLIC BYPASS
            → public?   → next()
            → else      → guards
```

**Risk:** A new route under `/api/student`, `/api/tests`, etc. without a grid row was treated as **public**. Forgotten registration = silent data exposure.

## After (fail-closed — enforced)

```text
Request → matchProtectedNamespace(path)
            → protected + (no rule OR public rule)? → DENY + audit + CeeUnknownProtectedRouteError
          → matchProtectionRule(path)
            → no rule (non-protected) → next()
            → public / identity_only / entitlement → explicit policy
            → unknown policy → DENY
```

**Boot:** `validateProtectionGridAtStartup()` in `server.js` checks namespaces ↔ grid labels ↔ `app.js` mounts ↔ route modules before `listen`.

## Modules

| File | Role |
|------|------|
| `protectedNamespaceRegistry.js` | Immutable instructional prefixes |
| `protectionGrid.js` | Runtime grid + fail-closed middleware |
| `protectionGridValidator.js` | Startup integrity checks |
| `applicationMountManifest.js` | Canonical Express mounts (sync with `app.js`) |
| `protectionGridDiagnostics.js` | SIEM audit + dev console denial logs |
| `ProtectionGridErrors.js` | `CEE_UNKNOWN_PROTECTED_ROUTE`, `CEE_PROTECTION_GRID_MISCONFIGURED` |

## Protected namespaces

- `/api/student`
- `/api/tests`
- `/api/uploads`
- `/api/results`
- `/api/lectures`

Extend only by updating the registry, adding a grid rule, updating the mount manifest, and passing `npm run test:protection-grid`.

## Attack scenarios prevented

| Scenario | Before | After |
|----------|--------|-------|
| Developer adds `router.get('/new-feature')` under `/api/student` without grid row | Public access | 403 + security audit |
| Typo removes entitlement rule from grid | Namespace falls through | Startup failure |
| Duplicate/conflicting grid labels | Undefined precedence | Startup failure |
| Mounted `/api/tests` without entitlement policy | Possible if no path match | Startup failure |
| Attacker probes `/api/student/internal-export` | 404 or leak if handler exists unguarded | Grid denies before handler if unregistered; registered paths still need entitlement |

## Testing strategy

1. **CI / local:** `npm run test:protection-grid` — registry + mounts + route modules.
2. **Boot:** Start API without `CEE_SKIP_GRID_STARTUP_VALIDATION` — expect log `Startup validation passed`.
3. **Runtime:** With grid intentionally broken (test only), `GET` under protected prefix without rule → `CEE_UNKNOWN_PROTECTED_ROUTE` (403).
4. **Regression:** Grep for `if (!rule) return next()` in `protectionGrid.js` — must not exist for protected namespaces.
5. **Integration:** Existing `test:secure-attempt`, student results scripts — entitlement still enforced after grid pass-through.

## Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `CEE_SKIP_GRID_STARTUP_VALIDATION` | unset | `true` skips boot validation (emergency only) |
| `NODE_ENV=test` | — | Skips boot validation |

## Diagnostics fields (runtime denial)

- `path`, `namespace`, `policyStatus`, `middlewareStack`, `timestamp`
- SIEM action: `protection_grid.unknown_protected_route`
