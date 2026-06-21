# Test completeness access control (G-06)

`GET /admin/tests/:testId/completeness` exposes publish-readiness metadata (wizard steps, draft counts, `missing_fields`, MCQ validation summary). This is **owner-scoped** for regular admins.

## Authorization model

| Role | Completeness access |
|------|---------------------|
| `super_admin` | Any test |
| `admin` | Tests where `created_by` matches caller (legacy rows with `created_by IS NULL` remain accessible) |
| `teacher` | Owned tests only (same as publish) |
| Unauthenticated | `401` |

Enforced via `assertTestCompletenessAccess()` → `assertTestMutationAccess()` with `action: 'completeness_read'` — **aligned with publish permissions**.

## IDOR protection

- Non-owner admin → `403 FORBIDDEN` (`TEST_MUTATION_OWNERSHIP_DENIED` audit)
- Unknown test id → `404 NOT_FOUND`
- No report body leaked before authorization check

## Not the same as general test read

`assertTestReadAccess()` still allows any admin to read linked questions. Completeness intentionally uses the **stricter publish/mutation gate** because it reveals draft integrity and publish eligibility.
