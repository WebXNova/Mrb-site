# question_bank Soft-Delete Schema Hardening

Production migration adding audit accountability (`deleted_by`) and index strategy for soft-deleted questions.

## Migration plan

| Phase | Action | Downtime |
|-------|--------|----------|
| 0 | Full DB backup + capture row counts | None |
| 1 | Preflight: confirm `question_bank`, `users`, `deleted_at` exist | None |
| 2 | `ADD COLUMN deleted_by BIGINT NULL` (INPLACE, LOCK=NONE) | None expected |
| 3 | Add `idx_qb_deleted_at` | None expected |
| 4 | Add `idx_qb_active_list` | None expected |
| 5 | Add FK `fk_qb_deleted_by → users(id)` | Brief metadata lock |
| 6 | Add CHECK (only if no orphan soft-deletes) | Brief metadata lock |
| 7 | Verification queries | None |
| 8 | (Optional) Wire application DELETE API to set `deleted_by` | Separate release |

**Apply order:** SQL file or Node runner — both idempotent.

```bash
# SQL (recommended for production change window)
mysql -u mrb_app -p mrb_learning < src/sql/migrations/question_bank_soft_delete_hardening.sql

# Node (dev/staging parity)
node scripts/run-question-bank-soft-delete-migration.mjs
node scripts/run-question-bank-soft-delete-migration.mjs --verify
```

---

## Schema changes

### Column: `deleted_by BIGINT NULL`

- Placed after `deleted_at` for logical grouping.
- Nullable: active rows remain `NULL`; set only on soft delete.
- Existing rows unchanged (all `NULL`).

### Foreign key: `fk_qb_deleted_by`

```sql
FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
```

**Why `ON DELETE SET NULL` (not RESTRICT):**

- `created_by` uses RESTRICT because it is required at insert time.
- `deleted_by` is audit metadata; if an admin account is removed, the soft-deleted question row must remain.
- SET NULL preserves the deletion timestamp while dropping the broken reference.

**Why the FK exists:**

- Prevents typos/bugs from writing non-existent user IDs.
- InnoDB auto-indexes FK columns (supports joins in audit reports).

### CHECK: `chk_qb_soft_delete_actor`

```sql
CHECK (deleted_at IS NULL OR deleted_by IS NOT NULL)
```

**Why:**

- Enforces accountability: a soft-deleted row must record who deleted it.
- Skipped automatically during migration if legacy soft-deleted rows exist without `deleted_by` (backfill first).

---

## Index strategy

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_qb_deleted_at` | `(deleted_at)` | Recycle-bin queries (`deleted_at IS NOT NULL`), deletion timeline reports, cardinality filter on active vs deleted |
| `idx_qb_active_list` | `(deleted_at, course_id, id)` | Primary admin list pattern: active questions per course, newest first (`deleted_at IS NULL AND course_id = ? ORDER BY id DESC`) |
| *(implicit)* | `deleted_by` | InnoDB FK index — audit joins to `users` |

**Why not index `deleted_at` alone on a composite-only design?**

- Standalone `deleted_at` index supports trash views and analytics without scanning the full table.
- Composite `idx_qb_active_list` avoids filesort for the hottest list API path.

**Existing indexes preserved:** `idx_course`, `idx_subject`, etc. — no breaking changes.

---

## Up migration

Files:

- `src/sql/migrations/question_bank_soft_delete_hardening.sql`
- `src/db/ensureQuestionBankSoftDeleteSchema.js`
- `scripts/run-question-bank-soft-delete-migration.mjs`

Canonical fresh install: `src/sql/schema.sql` (updated).

---

## Down migration

File: `src/sql/migrations/question_bank_soft_delete_hardening_rollback.sql`

Node: `node scripts/run-question-bank-soft-delete-migration.mjs --rollback`

**Safety gate:** Rollback aborts if any row has `deleted_by IS NOT NULL` (audit data loss).

---

## Verification SQL

```sql
-- Column + constraints
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'question_bank'
  AND COLUMN_NAME IN ('deleted_at', 'deleted_by');

SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'question_bank'
  AND CONSTRAINT_NAME IN ('fk_qb_deleted_by', 'chk_qb_soft_delete_actor');

-- Indexes
SHOW INDEX FROM question_bank
WHERE Key_name IN ('idx_qb_deleted_at', 'idx_qb_active_list');

-- Data integrity
SELECT
  COUNT(*) AS total,
  SUM(deleted_at IS NULL) AS active,
  SUM(deleted_at IS NOT NULL) AS soft_deleted,
  SUM(deleted_at IS NOT NULL AND deleted_by IS NULL) AS needs_backfill
FROM question_bank;

-- FK validity (must return 0)
SELECT COUNT(*) AS orphan_deleted_by
FROM question_bank qb
LEFT JOIN users u ON u.id = qb.deleted_by
WHERE qb.deleted_by IS NOT NULL AND u.id IS NULL;

-- Explain plan — admin list (should use idx_qb_active_list)
EXPLAIN SELECT id, question_text
FROM question_bank
WHERE deleted_at IS NULL AND course_id = 37
ORDER BY id DESC
LIMIT 20;
```

CLI verify:

```bash
node scripts/run-question-bank-soft-delete-migration.mjs --verify
```

---

## Risk analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Long-running ALTER on large table | Medium | Read latency | `ALGORITHM=INPLACE, LOCK=NONE`; run in low-traffic window |
| FK add fails on orphan `deleted_by` | Low | Migration halt | Column added as NULL; no backfill writes invalid IDs |
| CHECK blocks migration | Low | CHECK skipped | Preflight counts soft-deleted rows without actor |
| Rollback loses audit data | Medium if forced | Compliance | Rollback blocked when `deleted_by` populated |
| Existing APIs break | Very low | Outage | Additive column; all reads filter `deleted_at IS NULL` unchanged |

---

## Rollback strategy

1. Confirm no production dependency on `deleted_by` (application not yet deployed).
2. Export audit data if any `deleted_by` values exist:
   ```sql
   SELECT id, deleted_at, deleted_by FROM question_bank WHERE deleted_by IS NOT NULL;
   ```
3. Run rollback SQL or `--rollback` Node script.
4. Verify column and indexes removed.
5. Revert `schema.sql` change in version control if rolling back code branch.

---

## Production notes

- **Backup first:** logical dump or snapshot before DDL.
- **MySQL 8.0.16+** required for CHECK constraint.
- **No application code in this migration** — existing APIs ignore `deleted_by` until delete endpoint is implemented.
- **Backfill** (if soft-deleted rows pre-exist):
  ```sql
  -- Example: assign to super_admin id 1 (adjust after review)
  UPDATE question_bank
  SET deleted_by = 1
  WHERE deleted_at IS NOT NULL AND deleted_by IS NULL;
  ```
  Then re-run CHECK step or full migration (idempotent).
- **Monitor:** `SHOW PROCESSLIST` during ALTER; watch InnoDB history list length.
- **Do not** register in startup auto-patch until approved — run manually in production.
