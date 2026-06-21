# student_questions Schema Hardening

## Current state (pre-migration audit)

| Column | Nullable | Existing FK | Gap |
|--------|----------|-------------|-----|
| `user_id` | NOT NULL | Sometimes `fk_student_questions_user` on greenfield | Legacy DBs may lack FK |
| `course_id` | NULL | **None** | Orphan IDs possible |
| `subject_id` | NULL | **None** | Orphan IDs possible |
| `assigned_teacher_id` | NULL | **None** | Orphan / non-teacher IDs possible |
| `answered_by` | NULL | Sometimes `fk_student_questions_answered_by` | Legacy DBs may lack FK |

**Teachers** are rows in `users` with `role='teacher'` — no separate `teachers` table.

### Existing indexes (may vary by environment)

| Index | Columns | Workload |
|-------|---------|----------|
| `idx_student_questions_user_created` | `(user_id, created_at DESC)` | Student thread list |
| `idx_student_questions_status_subject` | `(status, subject)` | Legacy slug filters |
| `idx_sq_course_subject_status` | `(course_id, subject_id, status)` | Entitlement-scoped queries |
| `idx_sq_teacher_inbox` | `(assigned_teacher_id, status, updated_at)` | Teacher inbox |
| `idx_student_questions_updated` | `(updated_at DESC)` | Recency sorts |

This migration adds **single-column indexes** where no left-prefix index exists, then adds **foreign keys**.

---

## Safe production migration path (zero-downtime)

### Phase 0 — Backup (required)

```bash
mysqldump --single-transaction --routines --triggers \
  -u USER -p DATABASE_NAME student_questions > student_questions_backup_$(date +%Y%m%d).sql
```

### Phase 1 — Orphan audit (read-only)

```bash
mysql -u USER -p DATABASE_NAME < src/sql/migrations/student_questions_orphan_audit.sql
```

Or via Node:

```bash
node scripts/run-student-questions-integrity-migration.mjs --audit
```

**Blocking checks (must be 0 before FK add):**

- `orphan_user_id`
- `orphan_course_id`
- `orphan_subject_id`
- `orphan_assigned_teacher_id`
- `orphan_answered_by`
- `assigned_teacher_wrong_role`
- `subject_course_mismatch`

### Phase 2 — Data cleanup (preserves rows)

```bash
mysql -u USER -p DATABASE_NAME < src/sql/migrations/student_questions_orphan_cleanup.sql
```

Review verification output, then `COMMIT` (or `ROLLBACK`).

**Cleanup strategy:**

| Issue | Action | Data loss |
|-------|--------|-----------|
| Invalid `course_id` | `SET NULL` | None — question kept |
| Invalid `subject_id` | `SET NULL` | None |
| Invalid `assigned_teacher_id` | `SET NULL` | None — may need re-assignment |
| Invalid `answered_by` | `SET NULL` | None |
| Non-teacher `assigned_teacher_id` | `SET NULL` | None |
| `course_id` ≠ subject's course | Repair from `subjects.course_id` | None |
| Missing `user_id` parent | **DELETE** row | Row removed (backup in mysqldump) |

### Phase 3 — Schema hardening (online)

Indexes use `ALGORITHM=INPLACE, LOCK=NONE` (MySQL 8+, InnoDB).

```bash
node scripts/run-student-questions-integrity-migration.mjs --dry-run
node scripts/run-student-questions-integrity-migration.mjs
node scripts/run-student-questions-integrity-migration.mjs --verify
```

Or raw SQL:

```bash
mysql -u USER -p DATABASE_NAME < src/sql/migrations/student_questions_integrity_hardening.sql
```

**Downtime:** None expected for reads/writes. Brief metadata locks on `ALTER TABLE` (typically sub-second on tables &lt; 1M rows).

### Phase 4 — Rollback (if needed)

```bash
mysql -u USER -p DATABASE_NAME < src/sql/migrations/student_questions_integrity_hardening_rollback.sql
```

Restore data only from Phase 0 backup — rollback does not undo NULL cleanup.

---

## Foreign key design

| FK | ON DELETE | Rationale |
|----|-----------|-----------|
| `user_id` → `users(id)` | `CASCADE` | Student deleted → questions removed |
| `course_id` → `courses(id)` | `SET NULL` | Course archived/deleted → history preserved |
| `subject_id` → `subjects(id)` | `SET NULL` | Subject removed → question kept |
| `assigned_teacher_id` → `users(id)` | `SET NULL` | Teacher account removed → unassign |
| `answered_by` → `users(id)` | `SET NULL` | Answerer deleted → answer text kept |

**Role guard:** `trg_sq_assigned_teacher_role_before_insert/update` enforces `assigned_teacher_id` references `users.role='teacher'` (MySQL cannot express this in FK alone).

---

## Indexes added

| Index | Column(s) | When skipped |
|-------|-----------|--------------|
| `idx_sq_user_id` | `user_id` | If another index starts with `user_id` |
| `idx_sq_status` | `status` | If another index starts with `status` |
| `idx_sq_created_at` | `created_at` | If missing |
| `idx_sq_updated_at` | `updated_at` | If `idx_student_questions_updated` exists |
| `idx_sq_course_id` | `course_id` | If composite `(course_id, …)` exists |
| `idx_sq_subject_id` | `subject_id` | **Usually added** — not leftmost in composites |
| `idx_sq_assigned_teacher_id` | `assigned_teacher_id` | If `idx_sq_teacher_inbox` exists |

---

## Performance impact analysis

### Index additions

| Impact | Estimate |
|--------|----------|
| **Read queries** | Teacher inbox, student threads, subject load-balancing — **5–20% faster** on large tables (10k+ rows) due to dedicated `subject_id` and `created_at` indexes |
| **Write overhead** | Each INSERT/UPDATE maintains ~7–9 indexes — **~5–15% slower writes** (acceptable for Q&A volume) |
| **Storage** | ~1–2 KB per row index overhead (depends on column cardinality) |
| **Migration time** | INPLACE index build: ~1–5 s per 100k rows (hardware dependent) |
| **FK validation** | One-time full table scan during `ADD CONSTRAINT` — plan during low traffic |

### Query patterns benefited

```sql
-- Teacher inbox (uses idx_sq_teacher_inbox)
WHERE assigned_teacher_id = ? AND status = 'pending' ORDER BY updated_at

-- Student threads (uses idx_sq_user_id / idx_student_questions_user_created)
WHERE user_id = ? ORDER BY created_at DESC

-- Load balancing (uses idx_sq_subject_id)
WHERE subject_id = ? AND status = 'pending'
```

### Monitoring post-deploy

- `SHOW ENGINE INNODB STATUS` — lock waits during migration
- Slow query log — confirm inbox queries use `idx_sq_teacher_inbox`
- `activity_logs` — FK violation errors should be **zero** (app already validates)

---

## Files

| File | Purpose |
|------|---------|
| `sql/migrations/student_questions_orphan_audit.sql` | Read-only orphan detection |
| `sql/migrations/student_questions_orphan_cleanup.sql` | Pre-FK data repair |
| `sql/migrations/student_questions_integrity_hardening.sql` | Forward migration |
| `sql/migrations/student_questions_integrity_hardening_rollback.sql` | Rollback |
| `db/ensureStudentQuestionsIntegritySchema.js` | Idempotent Node runner |
| `scripts/run-student-questions-integrity-migration.mjs` | CLI (`--audit`, `--dry-run`, `--verify`) |
