# Teacher Inbox & Thread Performance Audit

Principal Performance Engineer audit of teacher Q&A inbox and thread endpoints. Target: efficient operation at **10,000+ questions** with authorization and transaction safety preserved.

## N+1 Patterns Identified

| Location | Pattern | Severity |
|----------|---------|------------|
| `openTeacherQuestionThread` | `UPDATE` per unread message in `for` loop | **Critical N+1** |
| `resolveStudentUserIdFromThreadId` | `SELECT DISTINCT user_id` full scan + O(students) HMAC | **Scale risk** (not SQL N+1) |
| `listTeacherQuestionThreads` COUNT | `COUNT(*)` over full aggregation subquery | **Expensive plan** |
| `listTeacherQuestionThreads` list | `GROUP_CONCAT(body, course, subject)` per thread | **Memory/CPU at scale** |

**No N+1 found** in: flat inbox (`listTeacherQuestionInbox`), single-question detail, answer submit, pin, student context.

---

## Query Count: Before vs After

### `openTeacherQuestionThread` (transactional)

Fixed overhead: `assertTeacher`(1) + `resolveThread`(1) + `BEGIN` + `SELECT … FOR UPDATE` + `COMMIT` = **5 queries**

| Unread messages (N) | BEFORE | AFTER | Saved |
|---------------------|--------|-------|-------|
| 1 | 6 | 6 | 0 |
| 50 | 55 | 6 | 49 |
| 500 | 505 | 6 | 499 |
| 2,000 | 2,005 | 6 | 1,999 |

At 10k questions (~20 unread/thread average): **~25 queries → ~6 queries** per thread open.

### `resolveStudentUserIdFromThreadId`

| | BEFORE | AFTER |
|---|--------|-------|
| SQL queries | 1 | 1 |
| Access pattern | `SELECT DISTINCT user_id` (all students) | `WHERE teacher_thread_ref = ?` index seek |
| Node work | O(students) HMAC | O(1) |

### `listTeacherQuestionThreads` (per page)

| | BEFORE | AFTER |
|---|--------|-------|
| SQL queries | 4 | 4 |
| COUNT | Subquery over full `GROUP BY` aggregate | `COUNT(DISTINCT user_id)` |
| Latest preview | `GROUP_CONCAT` body + course + subject | `GROUP_CONCAT(id)` + `JOIN` latest row |

---

## SQL Changes

### 1. Set-based seen marking (replaces per-row loop)

```sql
UPDATE student_questions
SET seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE user_id = ?
  AND assigned_teacher_id = ?
  AND status = 'pending'
  AND seen_at IS NULL;
```

**Authorization preserved:** `assigned_teacher_id = session teacher` on every row touched.  
**Transaction preserved:** runs inside existing `BEGIN … FOR UPDATE … COMMIT` block.

### 2. Indexed thread resolution

New column + index:

```sql
ALTER TABLE student_questions ADD COLUMN teacher_thread_ref VARCHAR(22) NULL;
ALTER TABLE student_questions ADD INDEX idx_sq_teacher_thread_ref (assigned_teacher_id, teacher_thread_ref);
ALTER TABLE student_questions ADD INDEX idx_sq_teacher_user_updated (assigned_teacher_id, user_id, updated_at);
```

Lookup:

```sql
SELECT user_id
FROM student_questions
WHERE assigned_teacher_id = ? AND teacher_thread_ref = ?
LIMIT 1;
```

Populated on INSERT (`studentQuestionCreate.service.js`) and via backfill script for existing rows.

### 3. Thread list COUNT optimization

```sql
-- BEFORE
SELECT COUNT(*) AS total FROM (<full thread aggregate subquery>) AS thread_rows;

-- AFTER
SELECT COUNT(DISTINCT sq.user_id) AS total
FROM student_questions sq
  INNER JOIN users u ON u.id = sq.user_id
  ...
WHERE sq.assigned_teacher_id = ?;
```

### 4. Thread list latest-message join

Aggregate only IDs per `user_id`, then join the latest row for body/course/subject — avoids large `GROUP_CONCAT` on `TEXT` columns.

---

## Files Changed

| File | Change |
|------|--------|
| `teacherQuestionThreads.service.js` | Set-based UPDATE; COUNT DISTINCT; join-based latest row |
| `teacherQuestionThreadRef.js` | Indexed lookup + legacy fallback |
| `teacherQuestionSeen.service.js` | Shared set-based SQL constants |
| `teacherQuestionDetail.service.js` | Uses shared seen SQL |
| `studentQuestionCreate.service.js` | Writes `teacher_thread_ref` on INSERT |
| `ensureStudentQuestionsFoundationSchema.js` | Column + indexes on bootstrap |
| `sql/migrations/student_questions_teacher_thread_ref.sql` | SQL migration |
| `scripts/backfill-teacher-thread-ref.mjs` | Backfill existing rows |
| `scripts/benchmark-teacher-inbox-performance.mjs` | Query model + live timing |

---

## Performance Benchmark

Run:

```bash
npm run benchmark:teacher-inbox
npm run benchmark:teacher-inbox -- --live   # optional DB timing
```

Backfill (after deploy):

```bash
npm run backfill:teacher-thread-ref
```

---

## Authorization & Transaction Safety

- All queries retain `assigned_teacher_id = ?` bound to session teacher ID.
- Thread open: `FOR UPDATE` lock before set-based seen update; rollback on empty thread.
- Set-based UPDATE cannot mark rows owned by another teacher (WHERE clause enforces scope).
- Thread ref fallback (pre-backfill) uses same HMAC logic as before — no auth weakening.

---

## Deployment

1. Deploy code (bootstrap adds column/indexes on server start).
2. Run `npm run backfill:teacher-thread-ref` on production.
3. Verify with `npm run test:teacher-question-threads-security`.
4. Monitor thread-open latency and slow query log for `GROUP BY` on large teachers.
