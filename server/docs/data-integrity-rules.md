# Data integrity rules (design)

## Target hierarchy (future model)

Intended direction when subjects/chapters exist:

`COURSES` → `SUBJECTS` → `CHAPTERS` → `LECTURES` / `TESTS`

Today, lectures reference **courses** only; tests carry a free-text **subject** string. The **`subjects`** table exists for **course-scoped** curriculum containers (`subjects.course_id`); it is **not** wired to lectures or tests yet. This document states **intent** and current physical DDL for `subjects` only where landed.

## FK directions (current + proposed)

- `lectures.course_id` → `courses.id` (exists).
- `subjects.course_id` → `courses.id` **ON DELETE CASCADE** (exists; subjects removed when a course row is hard-deleted / purged).
- Future: `chapters.subject_id` → `subjects.id` (course still implied via subject → course).
- Future: `lectures.subject_id` → `subjects.id` and/or `tests.subject_id` instead of sole reliance on VARCHAR `subject` (migration + backfill TBD).

**Rule:** Subjects are **never** global; every `subjects` row belongs to exactly one course.

## Deletion policy

- **No hard-delete** of user-visible aggregates in normal admin flows; prefer `is_active`, `archived_at`, or soft-delete companion rows.
- **Courses:** Default delete path is **archive** (`is_active = false`). **Purge** requires `super_admin` and optional `forceCascade` when lectures exist (see `courses.controller.js`).
- **Tests / Q&A:** Until soft-delete is uniform, use status enums (`draft` / `published` / `archived`) where implemented.
- **Subjects:** Admin `DELETE` on `/api/admin/courses/:courseId/subjects/:subjectId` maps to **`is_active = false`** (soft); preserves `id` for a future FK migration. Reactivation via `PUT` with `isActive: true`.

## Integrity with current schema

- Reference DDL lives in `server/src/sql/schema.sql` (CREATE only).
- Schema changes are made in `server/src/sql/schema.sql` and applied manually to existing databases.

## Subject ordering contract

The `subjects` table uses `order_index` (INT, default `0`) to express **deterministic**, course-scoped presentation order.

**Invariant.** After any successful write that affects ordering — `POST` create, `PUT /:subjectId` with `orderIndex`, or `PUT /reorder` — every row for a given `course_id` has a distinct `order_index` value. Reorder additionally guarantees the values form the **contiguous** range `0..n-1` for that course.

**Canonical reorder set (inclusion policy).** The reorder endpoint operates on **every** subject row of the course, including those with `is_active = false`. Inactive subjects are part of the canonical ordering so that hiding them does not silently move other rows, and reactivation restores them at their last known position. The admin UI fetches the full list internally even when "Show inactive" is off, and skips over hidden rows when applying a "move up / move down" interaction.

**Reorder algorithm (transactional).**

1. `BEGIN`.
2. `SELECT id FROM subjects WHERE course_id = ? ORDER BY order_index ASC, id ASC FOR UPDATE` — row-locks the entire course's subject set.
3. Validate that the client-provided `orderedSubjectIds` is a **permutation** of the locked id set (same multiset, no duplicates, no foreign ids, length matches). On mismatch: `ROLLBACK` and respond `422 REORDER_INVALID`.
4. For `i` in `0..n-1`: `UPDATE subjects SET order_index = ? WHERE id = ? AND course_id = ?`.
5. `COMMIT` and return the newly ordered list.

**Single-row writes.** `POST` create assigns `MAX(order_index) + 1` when no explicit `orderIndex` is given; an explicit `orderIndex` that collides with an existing row in the same course is rejected with `409 ORDER_INDEX_COLLISION`. `PUT /:subjectId` honoring an explicit `orderIndex` does the same collision check; for any non-adjacent reordering UX, prefer the batch reorder endpoint.

**Concurrency.** Two concurrent reorder calls serialize on the `FOR UPDATE` row locks; the second commit wins. PATCH writes that include `expectedUpdatedAt` reject stale updates with `409 STALE_SUBJECT` (compared with one-second tolerance against the row's `updated_at`).

**Cap.** The reorder payload is capped at 500 ids to bound lock duration and validation cost.

**Audit.** Reorder commits emit `admin.subject.reorder_batch`; single-row order changes emit `admin.subject.reorder`; activation transitions emit `admin.subject.activate` / `admin.subject.deactivate`.
