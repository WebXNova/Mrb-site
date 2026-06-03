# CEE DB Data Boundary — Entitlement-Safe Data Architecture

## Before (discipline-based)

```text
HTTP Protection Grid → route handlers
        ↓
Services → mysqlPool.query (often unscoped)
        ↓
MySQL (no structural enforcement)
```

**Risks:** Cross-course reads via `user_id` only, orphan tests, duplicate active enrollments, silent `return []` on errors.

## After (structural enforcement)

```text
HTTP Protection Grid (fail-closed)
        ↓
Service ownership validation (ownershipValidation.js)
        ↓
scopedQuery({ courseId, context, userId }) → validateScopedQuery
        ↓
AsyncLocalStorage validated context → mysqlPool.query
        ↓
MySQL (NOT NULL course_id, one-active-enrollment triggers)
```

**Production:** `CEE_ENFORCE_INSTRUCTIONAL_POOL_GUARD` defaults **on** — raw `mysqlPool.query` touching protected tables without scoped context **throws**.

---

## Protected instructional tables

| Registry key | Table | Scope |
|--------------|-------|--------|
| courses | courses | `courses.id = ?` |
| subjects | subjects | `course_id = ?` |
| chapters | chapters | via `subjects.course_id` |
| lectures | lectures | `course_id = ?` |
| tests | tests | `course_id = ?` |
| questions | test_questions | via `tests.course_id` |
| test_attempts | test_attempts | via `tests.course_id` + `user_id` |
| results | test_results | via attempts → tests |
| uploads | (media) | HTTP + filename ownership |

---

## APIs (use these — not raw pool)

| API | Use case |
|-----|----------|
| `scopedQuery({ courseId, context, userId })` | Student / entitled reads & writes |
| `scopedQueryFromRequest(req, context)` | HTTP handlers after entitlement guard |
| `scopedQueryBypass({ reason, context })` | Admin jobs / analytics / migrations only |
| `assertAttemptOwnership` / `assertResultOwnership` | Service-layer object ownership |
| `queryScoped(executor, sql, courseId, params)` | Legacy one-shot |

---

## DB schema hardening

| Constraint | Mechanism |
|------------|-----------|
| `tests.course_id NOT NULL` | `ensureCeeDbConstraints.js` after orphan backfill |
| FK `tests.course_id → courses.id` | `ensureTestsCourseSchema.js` |
| One active enrollment / user | `enrollmentLifecycle.service.js` (transaction + row locks; no triggers) |
| App-level duplicate detection | `MultipleActiveEnrollmentsError` |

Manual SQL: `src/sql/migrations/cee_db_constraints.sql`

---

## Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `CEE_ENFORCE_INSTRUCTIONAL_POOL_GUARD` | `true` in production | Blocks raw pool on protected tables |
| `NODE_ENV=test` | — | Guard off for unit tests |

---

## Migration strategy (phased)

### Phase A — Student boundary (done)
- `studentPortal.service.js` — results, lectures, tests
- `testEntitlement.service.js` — scopedQuery
- `testAttempt.service.js` — secureAttemptContext + scopedQuery

### Phase B — Admin CRUD (in progress backlog)
- `test.service.js`, `lecture.service.js`, `subject.service.js`, `chapter.service.js`
- Pattern: `scopedQueryBypass({ reason: 'admin_job:…', context: 'admin.…' })` + explicit filters

### Phase C — CI enforcement
- `npm run audit:scoped-queries --strict` in CI
- `npm run test:db-boundary`

---

## Attack scenarios prevented

| Attack | Mitigation |
|--------|------------|
| Cross-course result harvest (`user_id` only) | `loadEntitledStudentResults` + `tests.course_id = ?` |
| Global test slug enumeration | `resolveEntitledTestBySlug` + scopedQuery |
| Raw pool in new service code | Pool guard + ALS from scopedQuery |
| Two active enrollments race | DB trigger + `MultipleActiveEnrollmentsError` |
| Orphan test access | `OrphanTestAccessDeniedError` + NOT NULL course_id |
| Controller-only checks | `ownershipValidation.js` in services |

---

## Testing strategy

### Unit
- `validateScopedQuery` rejects SQL without `course_id` on protected tables
- `detectProtectedTablesInSql` table extraction
- Bypass policy denies `studentPortal.*` contexts

### Integration
- `npm run test:db-boundary` — guard + scopedQuery smoke
- `npm run test:protection-grid`
- `npm run test:secure-attempt`
- `scripts/verify-student-results-entitlement.mjs`

### CI
```bash
npm run audit:scoped-queries --strict
npm run test:db-boundary
```

---

## Fail-closed rules

- No silent `return []` on instructional query failures
- No `catch` swallowing CEE errors into empty payloads
- Missing scope → `CeeUnscopedQueryDeniedError` + SIEM audit
- Missing ownership → `AttemptNotOwnedError` / `EnrollmentNotFoundError` + audit
