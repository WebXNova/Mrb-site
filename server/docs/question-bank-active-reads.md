# Question Bank — Active-Only Read Policy

Soft-deleted questions (`deleted_at IS NOT NULL`) must never appear in normal application flows.

## Architecture

```
questionBankQueries.service.js   ← canonical SQL fragments + filter builders
questionBankRead.service.js      ← shared read helpers (selector, assert exists)
questions.service.js             ← CRUD orchestration (uses query module for reads)
```

## Mandatory predicate

Every **read** path:

```sql
WHERE deleted_at IS NULL
-- or aliased:
WHERE qb.deleted_at IS NULL
```

## API coverage

| Endpoint / flow | Service | Active filter |
|-----------------|---------|---------------|
| `GET /api/questions` | `listQuestions` → `buildQuestionListFilters` | Yes |
| `GET /api/questions/:id` | `getQuestionById` → `activeQuestionByIdLookup` | Yes |
| Search / filter / pagination | `buildQuestionListFilters` | Yes |
| Test builder selector (future) | `listActiveQuestionsForSelector` | Yes |
| Test link validation (future) | `assertActiveQuestionExists` | Yes |
| Soft delete / update lock | `lockActiveQuestionRow` | Intentionally reads all states |

## Index usage

| Query pattern | Index |
|---------------|-------|
| List by course, newest first | `idx_qb_active_list (deleted_at, course_id, id)` |
| Recycle bin (future admin) | `idx_qb_deleted_at (deleted_at)` |

## Adding new reads

1. Add SQL to `questionBankQueries.service.js` — never inline `FROM question_bank` elsewhere.
2. Compose in `questionBankRead.service.js` or `questions.service.js`.
3. Run `npm run test:question-bank-active-filter`.

## Do not

- Query `question_bank` directly from controllers.
- Add reads without `deleted_at IS NULL`.
- Implement restore in read paths (out of scope).
