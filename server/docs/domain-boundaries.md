# Domain boundaries (intent)

This describes **aggregates** and allowed dependencies for the LMS. It is design documentation; physical tables for **chapters** and course-level pricing remain future work. The **`subjects`** table (course-scoped) is **in scope** as relational foundation only—wire-up to lectures/tests is a later phase.

## Course

- **Intent:** Sellable learning product with catalog metadata, lectures attachment, and lifecycle (active vs archived).
- **Allowed dependencies:** Lecture rows by `course_id`; admin auth for writes; public read for active courses.
- **Forbidden:** Expanding `courses` with new persisted marketing fields without migration + DTO review; reintroducing course-level subject strings into public APIs after removal from DTOs.
- **Frozen column set (API/DTO):** Writes and public reads follow `courseWriteBodySchema` / `toCoursePublicDto` — no `slug`, `accent_color`, `lectures_count`, `students_enrolled`, `rating`, `price`, or `subject` in client contracts.

## Subject (relational foundation)

- **Intent:** Course-scoped curriculum container (`subjects.course_id` → `courses.id`). **Not** a global subject catalog.
- **Table:** `subjects` (`id`, `course_id`, `title`, `description`, `order_index`, `is_active`, timestamps). Ownership: exactly one course per row.
- **API:** Admin-only CRUD under `/api/admin/courses/:courseId/subjects` (`subjects.controller.js`). **No** auto-inserts, **no** inference from legacy strings, **no** public or student routes in the foundation phase.
- **Not wired yet:** Lectures, tests, Q&A, and catalog **do not** use `subjects.id`. Legacy columns (`courses.subject`, `tests.subject`, `student_questions.subject`, `lectures.topic`) stay as documented in `subject-string-inventory.md` until explicit wire-up migrations.

## Chapter (future)

- **Intent:** Scoped unit under a subject for lectures/tests placement.
- **Dependency:** Relational `subjects` row (`subjects.id`), then lectures/tests FKs once wire-up exists.

## Lecture

- **Intent:** Ordered playable content for a course.
- **Allowed:** `course_id` FK; cascade on course purge when explicitly forced.

## Test

- **Intent:** Assessments (private admin or public slug flow).
- **Legacy:** `tests.subject` VARCHAR remains until subjects phase; API and admin UI depend on it.

## Enrollment (registration)

- **Intent:** Applicant intake and verification workflow separate from course enrollment product table.
- **Note:** Distinct from future “course enrollment” aggregate if introduced later.

## Course pricing (future)

- **Intent:** Monetization separate from static `courses.price` legacy column.

---

## Subjects phase readiness (gates)

**Foundation (in repo):** `subjects` table (`003_subjects_table.sql`), reference DDL in `schema.sql`, admin CRUD at `/api/admin/courses/:courseId/subjects`. **No** lecture/test FKs, **no** auto-seeding, **no** public catalog fields for subjects yet.

**Prerequisites (from earlier stabilization — still required before wire-up):**

1. **Migrations:** `schema_migrations` ledger in use; `npm run db:migrate` documented; new DDL only via numbered files under `server/src/db/migrations/`.
2. **API envelope:** Unified success/error JSON contracts end-to-end.
3. **Course contract:** Course write/read paths and DTOs remain frozen unless a migration + DTO review explicitly extends them.
4. **Subject inventory:** `subject-string-inventory.md` kept current as code changes.
5. **Legacy doc:** `legacy-compatibility.md` lists shims wire-up work must respect.

**Wire-up phase (separate initiative):** nullable `subject_id` on lectures/tests (or chapter indirection), backfill strategy, student/catalog UX. Do not treat `tests.subject` / `student_questions.subject` VARCHARs as FKs until those migrations exist.

When each wire-up milestone is done, check it off in your release tracker.
