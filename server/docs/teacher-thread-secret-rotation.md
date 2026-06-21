# Teacher Thread Secret — Security & Rotation

HMAC-based opaque thread identifiers for teacher Q&A (`teacherQuestionThreadRef.js`). **No insecure fallbacks** — `TEACHER_THREAD_SECRET` is mandatory.

## Threat Model

Thread IDs must not be guessable or forgeable. A weak or missing HMAC secret allows attackers to enumerate or impersonate student threads.

## Secret Requirements

| Requirement | Value |
|-------------|-------|
| Minimum length | 32 characters |
| Minimum unique characters | 12 (entropy heuristic) |
| Placeholder rejection | `changeme`, `example`, `dev-only`, `mrb-teacher`, etc. |
| Production fallback | **None** — server refuses to start |

Generate a production secret:

```bash
openssl rand -base64 48
```

## Startup Validation

`server.js` calls `validateTeacherThreadSecretAtStartup()` **before** DB connection and HTTP listen.

Failure modes (process exit):

- `TEACHER_THREAD_SECRET` missing or empty
- Length &lt; 32 characters
- Insufficient unique character entropy
- Weak / placeholder-like value
- Current secret duplicated in `TEACHER_THREAD_PREVIOUS_SECRETS`
- Duplicate entries in `TEACHER_THREAD_PREVIOUS_SECRETS`

Implementation: `src/security/teacherThreadSecret.js`

## Environment Variables

```env
TEACHER_THREAD_SECRET=<strong-random-secret>
# Optional during rotation window only:
TEACHER_THREAD_PREVIOUS_SECRETS=<old-secret-1>,<old-secret-2>
```

**Never** use `SESSION_SECRET`, JWT secrets, or hardcoded dev strings as substitutes.

## Thread ID Generation

```
threadId = HMAC-SHA256(TEACHER_THREAD_SECRET, "t:{teacherId}:s:{studentUserId}")[0:22 base64url]
```

- **New IDs** always use `TEACHER_THREAD_SECRET` (current).
- **Resolve** tries DB index on `teacher_thread_ref`, then HMAC with current + previous secrets.

## Backward Compatibility

| Mechanism | Purpose |
|-----------|---------|
| `teacher_thread_ref` column | Persisted ref at question INSERT — stable across secret rotation |
| `TEACHER_THREAD_PREVIOUS_SECRETS` | Resolve old URL thread IDs during rotation window |
| `resolveTeacherQuestionThreadId()` | API prefers stored DB ref over recomputed HMAC |
| Legacy HMAC scan | Fallback when `teacher_thread_ref` not yet backfilled |

After rotation, run backfill so indexed lookups stay fast:

```bash
npm run backfill:teacher-thread-ref
```

## Secret Rotation Procedure

### Phase 1 — Prepare

1. Generate new secret: `openssl rand -base64 48`
2. Store in secrets manager (Railway, Vault, etc.)

### Phase 2 — Overlap window (zero downtime)

1. Set `TEACHER_THREAD_PREVIOUS_SECRETS` to the **current** secret value
2. Set `TEACHER_THREAD_SECRET` to the **new** secret
3. Deploy **all** API instances simultaneously (shared config)
4. Verify startup log: `[security] TEACHER_THREAD_SECRET validated`
5. New questions receive refs computed with the new secret
6. Old thread URLs still resolve via previous secret in HMAC fallback

### Phase 3 — Stabilize

1. Run `npm run backfill:teacher-thread-ref` (optional — updates refs to new secret for indexed lookup; old refs remain valid until backfill)
2. Monitor `teacher.question.*` audit logs for access_denied spikes

### Phase 4 — Retire old secret

1. Confirm no traffic depends on previous secret (7–30 days overlap typical)
2. Remove old value from `TEACHER_THREAD_PREVIOUS_SECRETS`
3. Deploy all instances
4. Run backfill again so all rows use new-secret refs

### Rollback

Revert `TEACHER_THREAD_SECRET` to previous value and clear `TEACHER_THREAD_PREVIOUS_SECRETS`. Redeploy all instances.

## Deployment Checklist

- [ ] `TEACHER_THREAD_SECRET` set in production secrets (not in git)
- [ ] Secret ≥ 32 chars, generated with CSPRNG (`openssl rand -base64 48`)
- [ ] Secret not equal to JWT or session secrets
- [ ] All replicas share identical `TEACHER_THREAD_SECRET` / `PREVIOUS` values
- [ ] Server starts with `[security] TEACHER_THREAD_SECRET validated` in logs
- [ ] `npm run test:teacher-thread-secret-security` passes in CI
- [ ] After rotation: overlap window configured before removing old secret
- [ ] `teacher_thread_ref` backfill run after large rotations

## Verification

```bash
npm run test:teacher-thread-secret-security
```

## Files

| File | Role |
|------|------|
| `security/teacherThreadSecret.js` | Validation + secret loading |
| `services/teacherQuestionThreadRef.js` | HMAC build/resolve (no fallbacks) |
| `server.js` | Boot-time fail-closed validation |
