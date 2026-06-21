# Question Import Batch Traceability

Production migration adding per-question audit rows linking `question_import_batches` to `question_bank`.

## Audit finding (before)

| Capability | Status |
|------------|--------|
| Batch aggregate counts (`imported: 50`) | Yes |
| Which question IDs were created | No |
| Which rows belong to a batch | No |
| Per-question failure reason in DB | No |
| Reverse lookup question → batch | No |

`question_import_batches` stored only summary counters. Successful inserts did not record `question_bank.id`. Support could not answer: *"Which 50 questions came from batch 42?"*

---

## Migration plan

| Phase | Action | Downtime |
|-------|--------|----------|
| 0 | Full DB backup + note `question_import_batches` row count | None |
| 1 | Preflight: `question_import_batches`, `question_bank`, `users` exist | None |
| 2 | Create `question_import_batch_items` (additive, no ALTER on existing tables) | Brief metadata lock |
| 3 | Deploy server with `ensureQuestionImportBatchItemsSchema` on startup | None |
| 4 | Deploy import service that writes audit rows on each import | None |
| 5 | Verification queries (see below) | None |

**Apply order:** SQL file or Node runner — both idempotent.

```bash
# SQL (recommended for production change window)
mysql -u mrb_app -p mrb_learning < src/sql/migrations/question_import_batch_items.sql

# Node (dev/staging parity)
node scripts/run-question-import-batch-items-migration.mjs
node scripts/run-question-import-batch-items-migration.mjs --verify
```

**Rollback (drops audit table only — does not delete questions):**

```bash
mysql -u mrb_app -p mrb_learning < src/sql/migrations/question_import_batch_items_rollback.sql
```

---

## Schema: `question_import_batch_items`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | BIGINT PK | Audit row identity |
| `batch_id` | BIGINT FK → `question_import_batches.id` | Parent batch |
| `question_number` | INT | 1-based position in source file |
| `question_title` | VARCHAR(500) NULL | Truncated stem for support (survives NULL `question_id`) |
| `question_id` | BIGINT NULL FK → `question_bank.id` | Set on SUCCESS; NULL on FAILED |
| `status` | VARCHAR(20) | `SUCCESS` or `FAILED` |
| `error_code` | VARCHAR(100) NULL | Production-safe code on failure |
| `error_message` | VARCHAR(1000) NULL | Human-readable failure |
| `validation_layer` | VARCHAR(50) NULL | `aiken_validation`, `schema`, `persistence`, etc. |
| `created_at` | TIMESTAMP | Row insert time |

**Constraints**

- `UNIQUE (batch_id, question_number)` — one audit row per question slot per batch
- `ON DELETE CASCADE` from batch — removing a batch removes its audit rows
- `ON DELETE SET NULL` on `question_id` — audit survives hard question delete (rare)

**Indexes**

- `idx_import_items_batch` — batch detail queries
- `idx_import_items_question` — reverse lookup question → batch
- `idx_import_items_status` — failed-only analysis per batch
- `idx_import_items_created` — time-range audits

---

## Traceability model

```
users ──uploaded_by──► question_import_batches
                              │
                              │ 1:N
                              ▼
                    question_import_batch_items
                              │
                              │ question_id (SUCCESS only)
                              ▼
                         question_bank
```

| Question | Answer |
|----------|--------|
| Who imported batch 42? | `question_import_batches.uploaded_by` + `users` join |
| When? | `question_import_batches.created_at` |
| Which questions succeeded? | `question_import_batch_items WHERE batch_id = 42 AND status = 'SUCCESS'` |
| What failed and why? | `status = 'FAILED'` + `error_code` + `error_message` |
| Which batch created question 9912? | `GET /import/aiken/questions/9912/batches` |

---

## Backward compatibility

| Area | Behavior |
|------|----------|
| Existing `question_import_batches` rows | Unchanged; no backfill (historical batches have no item rows) |
| Import API response | Adds `importedQuestionIds[]`; existing fields unchanged |
| `question_bank` | No new columns; no migration on core table |
| Old clients | Continue to use `batchId`, `imported`, `failed`, `errors` |
| Server startup | `ensureQuestionImportBatchItemsSchema` creates table if missing |

**Note:** Batches imported before this migration will show empty `items` in batch detail API. Aggregate counters remain accurate.

---

## API endpoints (admin)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/questions/import/aiken/batches` | Batch history (paginated) |
| `GET` | `/api/admin/questions/import/aiken/batches/:batchId` | Batch + all item rows |
| `GET` | `/api/admin/questions/import/aiken/questions/:questionId/batches` | Reverse lookup |

Import response now includes:

```json
{
  "batchId": 42,
  "imported": 48,
  "failed": 2,
  "importedQuestionIds": [1001, 1002, "..."],
  "errors": [ "... structured diagnostics ..." ]
}
```

---

## Verification queries

```sql
-- Table exists
SHOW TABLES LIKE 'question_import_batch_items';

-- Recent batch with item linkage
SELECT b.id, b.file_name, b.successful_questions,
       COUNT(i.id) AS item_rows,
       SUM(i.status = 'SUCCESS') AS success_items,
       SUM(i.status = 'FAILED') AS failed_items
FROM question_import_batches b
LEFT JOIN question_import_batch_items i ON i.batch_id = b.id
GROUP BY b.id
ORDER BY b.created_at DESC
LIMIT 10;

-- Reverse lookup
SELECT * FROM question_import_batch_items WHERE question_id = ?;
```

---

## Files

| File | Role |
|------|------|
| `src/sql/migrations/question_import_batch_items.sql` | SQL migration |
| `src/sql/migrations/question_import_batch_items_rollback.sql` | Rollback |
| `src/db/ensureQuestionImportBatchItemsSchema.js` | Startup bootstrap |
| `src/services/questionImportBatchItems.service.js` | Insert + query helpers |
| `src/services/questionImportService.js` | Writes audit rows during import |
| `scripts/run-question-import-batch-items-migration.mjs` | CLI runner |
