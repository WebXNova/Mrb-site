# Course Ownership Service (Phase 1A)

Boolean foundation for **“does this student own this course?”** without duplicating entitlement storage.

## Service

`src/services/courseOwnership.service.js`

```js
import { studentOwnsCourse } from './services/courseOwnership.service.js';

const owns = await studentOwnsCourse(studentId, courseId);
```

## SQL query

Exported as `STUDENT_OWNS_COURSE_SQL`:

```sql
SELECT EXISTS(
  SELECT 1
  FROM enrollments e
  INNER JOIN users u ON u.id = e.user_id
  INNER JOIN courses c ON c.id = e.course_id
  WHERE e.user_id = ?
    AND e.course_id = ?
    AND e.access_status = 'active'
    AND e.status NOT IN ('pending', 'rejected')
    AND u.status = 'active'
    AND c.is_active = 1
  LIMIT 1
) AS owns_course
```

**Source of truth:** `enrollments.access_status = 'active'` (same as CEE).  
**Not a second system:** no new tables; mirrors `entitlement.service.js` grant rules.

## Error handling strategy

| Condition | Behavior |
|-----------|----------|
| Invalid / missing `studentId` or `courseId` | Return `false`, debug log |
| User not found or `users.status != 'active'` | Return `false` (INNER JOIN) |
| Course not found or `courses.is_active = 0` | Return `false` |
| `access_status` inactive/revoked | Return `false` |
| `status` pending/rejected | Return `false` |
| MySQL driver / connection error | Return `false`, warn log (fail-closed) |
| Unexpected throw from app code | Avoided — no throws in public API |

**Contrast with `assertCourseAccess()`:** entitlement asserts throw structured errors for middleware (fail-closed with HTTP mapping). `studentOwnsCourse()` is for soft checks (UI gating, preflight, batch filters) where `false` is enough.

## Security considerations

1. **Parameterized queries only** — `studentId` and `courseId` are bound; blocking statuses use bound placeholders.
2. **Fail-closed on DB failure** — errors become `false`, never accidental grant.
3. **No user input in SQL strings** — status lists come from shared entitlement constants.
4. **Identity is explicit** — pass authenticated `req.user.id`; do not trust client-supplied student id without JWT verification upstream.
5. **Same boundary as CEE** — instructional APIs should still use `entitlementGuard` + `assertCourseAccess`; this service does not replace middleware.
6. **Structured logs** — JSON logs with `studentId`, `courseId`, `reason`; no PII beyond ids.

## Example usage

```js
import { studentOwnsCourse } from '../services/courseOwnership.service.js';

async function canOpenCourseDashboard(req, courseId) {
  const studentId = req.user?.id;
  if (!studentId) return false;
  return studentOwnsCourse(studentId, courseId);
}

async function filterOwnedCourseIds(studentId, courseIds) {
  const results = await Promise.all(
    courseIds.map(async (id) => ((await studentOwnsCourse(studentId, id)) ? id : null))
  );
  return results.filter(Boolean);
}
```

**Fail-closed gate (throws):**

```js
import { assertCourseAccess } from './entitlement.service.js';

// Routes / content delivery
await assertCourseAccess(userId, courseId);
```

**Soft gate (boolean):**

```js
import { studentOwnsCourse } from './courseOwnership.service.js';

if (!(await studentOwnsCourse(userId, courseId))) {
  return { showUpgradePrompt: true };
}
```

## Unit test examples

See `src/services/courseOwnership.service.test.examples.mjs`.

Run static verification:

```bash
npm run test:course-ownership
```
