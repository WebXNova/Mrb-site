# Quiz Builder — Backend Draft Architecture

Design for server-side quiz draft persistence. **Phase 0 ships localStorage only**; this document defines the API and data model for Phase 1 server sync.

## Goals

- Persist in-progress quiz authoring across devices and browsers
- Keep draft edits separate from published test questions until explicit publish
- Support hydration on quiz-builder load without losing local recovery
- Allow conflict detection when multiple admins edit the same test

## Current Client State (Phase 0)

| Concern | Implementation |
|--------|----------------|
| Storage key | `quiz-builder-draft:{testId}` (or `draftKey` override) |
| Payload | `{ version, storageKey, testId, questions[], totalPoints, savedAt }` |
| Save trigger | Debounced 800ms + flush on unmount / `beforeunload` |
| Restore | Reducer lazy init via `readQuizDraft(storageKey)` |

## Proposed Database Model

### Table: `test_quiz_drafts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `test_id` | BIGINT FK → tests | UNIQUE — one draft per test |
| `payload` | JSONB NOT NULL | Full draft document (see schema below) |
| `revision` | INT NOT NULL DEFAULT 1 | Incremented on each save |
| `updated_by` | BIGINT FK → users | Last editor |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Index:** `UNIQUE (test_id)`

### Draft JSON schema (version 1)

```json
{
  "version": 1,
  "testId": "14",
  "questions": [],
  "totalPoints": 10,
  "savedAt": "2026-06-07T12:00:00.000Z"
}
```

Validation on write should mirror client `normalizeStoredQuestions()` in `quizDraftStorage.js`.

## API Endpoints

All routes require admin auth and test ownership/permission checks.

### `GET /admin/tests/:testId/quiz-draft`

Returns the server draft or `404` if none exists.

**Response 200**

```json
{
  "data": {
    "testId": 14,
    "revision": 3,
    "payload": { "version": 1, "questions": [], "totalPoints": 0, "savedAt": "..." },
    "updatedAt": "2026-06-07T12:00:00.000Z",
    "updatedBy": { "id": 1, "name": "Admin" }
  }
}
```

### `PUT /admin/tests/:testId/quiz-draft`

Upsert draft (create or replace). Supports optimistic concurrency.

**Request**

```json
{
  "payload": { "version": 1, "questions": [], "totalPoints": 0 },
  "expectedRevision": 3
}
```

- If `expectedRevision` is provided and does not match → `409 Conflict` with current draft in body
- If omitted on first save → create with `revision = 1`

**Response 200**

```json
{
  "data": {
    "revision": 4,
    "savedAt": "2026-06-07T12:01:00.000Z"
  }
}
```

### `DELETE /admin/tests/:testId/quiz-draft`

Clear draft after successful publish or explicit discard.

**Response 204**

### `POST /admin/tests/:testId/quiz-draft/publish`

Convert draft questions into real question bank records and link them to the test.

**Request**

```json
{
  "expectedRevision": 4,
  "mode": "replace"
}
```

- `mode: "replace"` — unlink existing test questions, link new ones from draft
- `mode: "append"` — add draft questions without removing existing links

**Response 200**

```json
{
  "data": {
    "linkedQuestionIds": [101, 102],
    "publishedAt": "2026-06-07T12:05:00.000Z"
  }
}
```

On success, delete draft row (or mark `published_at`).

## Hydration Strategy (Phase 1 Client)

Load order when opening `/admin/tests/:testId/quiz-builder`:

1. **Read localStorage** immediately (instant UI, offline recovery)
2. **Fetch server draft** in parallel
3. **Merge policy:**
   - No server draft → keep local, push local to server on next debounced save
   - No local draft → hydrate from server
   - Both exist → compare `savedAt` timestamps; prefer newer
   - If timestamps within 5s → prefer higher `revision` from server
4. On conflict (409 on PUT) → show modal: *Keep local / Use server / Compare*

## Sync Hook (Future)

Replace `useQuizDraftPersistence` internals with:

```
useQuizDraftSync({
  storageKey,
  testId,
  state,
  totalPoints,
  onSaved,
  api: adminApi,
})
```

- Local write remains first (never block typing)
- Server PUT debounced separately (e.g. 2s) after local save succeeds
- `revision` stored in localStorage alongside draft for conflict headers

## Storage Strategy Summary

| Layer | Purpose | TTL |
|-------|---------|-----|
| React state | Active editing | Session |
| localStorage | Offline / crash recovery | Until publish or manual clear |
| PostgreSQL JSONB | Cross-device drafts | Until publish or DELETE |
| Question bank tables | Published content | Permanent |

## Security

- Validate `testId` in payload matches URL param
- Cap question count (e.g. 200) and payload size (e.g. 2MB)
- Sanitize HTML in question/choice text on publish (reuse existing question sanitization)
- Audit log: `quiz_draft.saved`, `quiz_draft.published`, `quiz_draft.discarded`

## Migration Path

1. **Phase 0 (done):** localStorage read/write + status indicator + route guard
2. **Phase 1:** `GET/PUT` endpoints + background sync hook
3. **Phase 2:** Publish endpoint + wire to test completeness
4. **Phase 3:** Multi-editor conflict UI + draft history (optional)

## Related Server Files (existing)

- `server/src/routes/admin.routes.js` — add draft routes alongside test question routes
- `server/src/controllers/testQuestions.controller.js` — reference for test-question linking
- `client/src/api/adminApi.js` — add `getQuizDraft`, `putQuizDraft`, `publishQuizDraft`
