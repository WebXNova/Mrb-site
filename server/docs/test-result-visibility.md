# G-RT-07 — Student result visibility

Authoritative module: `src/services/testResultVisibility.service.js`

## Settings

| Setting | When `false` | When `true` |
|---------|--------------|-------------|
| `show_result_immediately` | No scores/summary; result endpoints return **403** | Summary (score, %, pass/fail) allowed |
| `show_answers_after_submit` | No answer review payload | Question review with your/correct answers |
| `show_explanations` | Review omits `explanation` | Explanations included in review (if answers shown) |

## Enforcement map

| Endpoint | Stack | Enforcement |
|----------|-------|-------------|
| `GET /api/student/results/:attemptId` | Portal | `result.service` → visibility service |
| `GET /api/tests/:slug/attempts/:id/result` | Slug | `getAttemptResult` → visibility service |
| `GET /api/attempts/:id/result` | Legacy | `result.service` → visibility service |
| Dashboard `results[]` | Portal | `redactStudentResultListItem` |
| Test history list | Portal | `resultAvailable` + null scores |

## Leakage prevented

- Raw `detail_json` never returned when `show_answers_after_submit = 0`
- `options[]` with `isCorrect` stripped from student review payloads
- Withheld tests never expose score metadata on list endpoints

## Tests

```bash
npm run test:result-visibility
```
