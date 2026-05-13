# Subject string inventory (non–course-domain)

This document classifies uses of the word **subject** and related query params. It is **not** a commitment to remove persisted `subject` columns before the subjects phase.

## Disambiguation

| Meaning | Examples | Notes |
|--------|-----------|--------|
| **Email subject line** | `email.service.js`, `emailVerification.service.js` local variable `subject` | Unrelated to curriculum “subject”; email RFC field. |
| **Relational `subjects` table** | `subjects` title + `id` | **Course-scoped** curriculum container (`course_id`); **not** the same as `tests.subject` VARCHAR or Q&A queue strings. Admin CRUD only until wire-up. |
| **Course catalog** | `courses.subject` column (nullable, legacy) | Not exposed in public course DTO; catalog filters use `?tab=` on the client. |
| **Tests aggregate** | `tests.subject` column, validators, `publicTests` meta | Active persistence and API until subjects/chapters phase. |
| **Student Q&A queue** | `student_questions.subject`, `?subject=` on admin Q&A API | Denotes question queue/category string, not course FK. |
| **Admin query param** | `GET /admin/student-questions?subject=` | Optional follow-up: rename to `queue` (coordinated FE+BE). |

## URL / routing

| Location | Pattern | Action |
|----------|---------|--------|
| `Footer.jsx` | Was `?subject=mdcat` | **Fixed** → `?tab=mdcat` (aligned with `CoursesPage`). |
| `adminApi.js` | `GET/POST/PUT/DELETE` `/admin/courses/:courseId/subjects` | **New** relational subject admin API (camelCase body fields: `orderIndex`, `isActive`). |
| `adminApi.js` | `?subject=` for student questions | **Keep**; optional rename to `queue` in a later PR. |

## Server modules (representative)

| Area | Files | Classification |
|------|-------|------------------|
| Tests CRUD / public | `test.service.js`, `tests.controller.js`, `publicTests.controller.js`, `testAttempt.service.js` | Legacy VARCHAR; subjects phase may replace with FK. |
| Relational subjects | `subject.service.js`, `subjects.controller.js`, `003_subjects_table.sql` | Course-owned rows; no auto-create; not linked to lectures/tests yet. |
| Student Q&A | `studentQuestions.service.js`, `adminStudentQuestions.controller.js` | Legacy VARCHAR queue key. |
| Student portal presentation | `studentPortal.service.js` | Reads `tests.subject` for UI; defensive fallbacks documented in legacy doc. |
| Email | `email.service.js`, `emailVerification.service.js` | **Email subject** only; rename local vars only if clarity needed. |

## Client

| File | Usage |
|------|--------|
| `constants/qaSubjects.js` | Allowed Q&A queue values for student ask form. |
| `AdminTestsPage.jsx` / test flows | Test metadata subject string. |
| `StudentAskQuestionPage.jsx` | Posts `subject` for Q&A. |

## Taxonomy for future work

- **Keep (phase 1):** Any column or API that would break production if removed without replacement.
- **Document:** Ambiguous naming (email vs domain subject).
- **Safe cleanup:** Dead links, deprecated query keys on marketing pages (Footer).
- **Coordinated rename:** Admin `?subject=` → `?queue=` when subjects schema exists.
