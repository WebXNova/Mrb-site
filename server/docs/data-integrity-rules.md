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
- Incremental / conditional alters are **migration-only** (`server/src/db/migrations/`), recorded in `schema_migrations` with checksums.
