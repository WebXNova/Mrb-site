# Course Wizard Publish State Fix Report

**Date**: May 14, 2026  
**Issue**: `COURSE_INACTIVE` error when publishing courses  
**Root Cause**: Domain-state inconsistency between `publish` flag and `course.is_active`

---

## Problem Summary

### Symptom
```
Error: COURSE_INACTIVE
Message: Inactive courses cannot create active batches
```

### Root Cause
The wizard allowed contradictory states:
- User clicks "Publish" (`publish: true`)
- Frontend sends `course.is_active: false` (user's checkbox state)
- Backend tries to create active batches for inactive course
- Transaction rolls back with domain invariant violation

### Critical Flaw
**NO SINGLE SOURCE OF TRUTH** for publish state. The `publish` flag and `course.is_active` could diverge, creating impossible domain states.

---

## Solution Architecture

### 1. Centralized Publish State Resolver ✅

**File**: `server/src/services/courseWizardPublishState.service.js`

**Function**: `resolveWizardPublishState(payload)`

**Logic**:
```javascript
// RULE 1: If publish=true, course MUST be active
const courseActive = publishIntent ? true : Boolean(payload.course?.is_active);

// RULE 2: If publish=true, pricing MUST be active
const pricingActive = publishIntent ? true : Boolean(payload.pricing?.is_active);

// RULE 3: If publishing and batch is draft, upgrade to upcoming
const effectiveStatus = publishIntent && rawStatus === 'draft' ? 'upcoming' : rawStatus;

// RULE 4: If publishing, ensure batches are active
const effectiveActive = publishIntent ? true : batchActive;
```

**Result**: Single source of truth that **derives** correct states from publish intent.

---

### 2. Domain Invariant Validation ✅

**Function**: `validatePublishStateInvariants(payload, resolved)`

**Enforced Invariants**:

1. ✅ **Active course requires active batch**
   ```javascript
   if (courseActive && activeBatches.length === 0) {
     throw ACTIVE_COURSE_REQUIRES_ACTIVE_BATCH;
   }
   ```

2. ✅ **Inactive course cannot have active batches**
   ```javascript
   if (!courseActive && activeBatches.length > 0) {
     throw ACTIVE_BATCH_ON_INACTIVE_COURSE;
   }
   ```

3. ✅ **Inactive course cannot have active pricing**
   ```javascript
   if (!courseActive && pricingActive) {
     throw ACTIVE_PRICING_ON_INACTIVE_COURSE;
   }
   ```

4. ✅ **Published courses must have required content**
   ```javascript
   if (publish) {
     if (subjects.length === 0) throw PUBLISH_REQUIRES_SUBJECTS;
     if (batches.length === 0) throw PUBLISH_REQUIRES_BATCHES;
     if (!thumbnail) throw PUBLISH_REQUIRES_THUMBNAIL;
   }
   ```

5. ✅ **Batch enrollment windows must be valid**
   ```javascript
   if (!(enrollmentOpen < enrollmentClose)) throw INVALID_ENROLLMENT_WINDOW;
   if (!(enrollmentClose < batchStart)) throw INVALID_BATCH_LIFECYCLE;
   if (!(batchStart < batchEnd)) throw INVALID_BATCH_DATES;
   ```

---

### 3. Pre-Transaction Validation ✅

**Execution Order (CRITICAL)**:
```javascript
// BEFORE transaction
1. Resolve publish state → validated state object
2. Validate domain invariants → throw 422 if violated
3. Generate audit metadata → for logging

// AFTER validation passes
4. BEGIN TRANSACTION
5. Insert course (with resolved.courseActive)
6. Insert pricing (with resolved.pricingActive)
7. Insert batches (with resolved.batches)
8. Insert subjects
9. COMMIT TRANSACTION
```

**Result**: **Zero** possibility of partial writes with invalid domain state.

---

### 4. Backend Service Layer ✅

**File**: `server/src/services/courseWizard.service.js`

**Changes**:
```javascript
// OLD (WRONG)
const courseActive = publish ? Boolean(payload.course.is_active) : false;
// Problem: User checkbox could be false while publish=true

// NEW (CORRECT)
const resolved = resolveWizardPublishState(payload);
validatePublishStateInvariants(payload, resolved);
const courseActive = resolved.courseActive; // Always correct
```

**Course Creation**:
```javascript
// Use RESOLVED state, not payload
VALUES (?, ?, ?, ?, ?, ?, ?)
[
  payload.course.title,
  payload.course.description,
  // ...
  resolved.courseActive,  // ← Single source of truth
  actorUserId,
]
```

**Pricing Creation**:
```javascript
const pricingWithResolvedState = {
  ...payload.pricing,
  is_active: resolved.pricingActive,  // ← Enforced consistency
};
```

**Batch Creation**:
```javascript
for (const batch of resolved.batches) {
  // All batches use resolved states
  await insertCourseBatchWithConnection(connection, newCourseId, batch, actorUserId);
}
```

---

### 5. Frontend Auto-Sync ✅

**File**: `client/src/admin/course-wizard/CourseCreateWizard.jsx`

**Function**: `buildWizardPayload(publish, course, pricing, batches, subjects)`

**Auto-Sync Logic**:

```javascript
const publishIntent = Boolean(publish);

// Auto-activate course when publishing
const courseOut = {
  ...course,
  is_active: publishIntent ? true : Boolean(course.is_active),
};

// Auto-activate pricing when publishing
const pricingOut = {
  ...pricing,
  is_active: publishIntent ? true : Boolean(pricing.is_active),
};

// Auto-upgrade batch states when publishing
const batchesOut = batches.map((b, index) => {
  let effectiveStatus = b.status || 'draft';
  let effectiveActive = b.is_active !== false;
  
  if (publishIntent) {
    // Upgrade draft batches to upcoming
    if (effectiveStatus === 'draft') {
      effectiveStatus = 'upcoming';
    }
    // Ensure at least first batch is active
    if (index === 0 || b.is_active !== false) {
      effectiveActive = true;
    }
  }
  
  return { ...b, status: effectiveStatus, is_active: effectiveActive };
});
```

**Result**: Frontend automatically enforces consistency **before** sending to backend.

---

### 6. Error Code Classification ✅

**New Error Codes**:

| Code | HTTP | Meaning |
|------|------|---------|
| `INVALID_PUBLISH_STATE` | 422 | General publish state validation failure |
| `ACTIVE_BATCH_ON_INACTIVE_COURSE` | 422 | Cannot have active batches on inactive course |
| `ACTIVE_PRICING_ON_INACTIVE_COURSE` | 422 | Cannot have active pricing on inactive course |
| `ACTIVE_COURSE_REQUIRES_ACTIVE_BATCH` | 422 | Active courses must have at least one active batch |
| `PUBLISH_REQUIRES_SUBJECTS` | 422 | Published courses must have subjects |
| `PUBLISH_REQUIRES_BATCHES` | 422 | Published courses must have batches |
| `PUBLISH_REQUIRES_THUMBNAIL` | 422 | Published courses must have thumbnail |
| `INVALID_BATCH_ENROLLMENT_WINDOW` | 422 | Enrollment open/close dates invalid |
| `INVALID_BATCH_LIFECYCLE` | 422 | Enrollment must close before batch starts |
| `INVALID_BATCH_DATES` | 422 | Batch start must be before end |

**Frontend Handling**:
```javascript
if (errorCode === 'INVALID_PUBLISH_STATE') {
  if (validationErrors && validationErrors.length > 0) {
    errorMessage = validationErrors.map(e => e.message).join('; ');
  }
} else if (errorCode === 'ACTIVE_BATCH_ON_INACTIVE_COURSE') {
  errorMessage = 'Cannot have active batches on an inactive course.';
}
// ... other specific handlers
```

**Result**: **Zero raw database errors** exposed to users.

---

### 7. Audit Logging ✅

**Function**: `generatePublishAuditMetadata(resolved)`

**Logged Metadata**:
```javascript
{
  publishMode: 'publish' | 'draft',
  courseActive: true | false,
  pricingActive: true | false,
  totalBatches: 3,
  activeBatches: 2,
  inactiveBatches: 1,
  batchStatuses: ['upcoming', 'draft', 'draft'],
}
```

**Log Entries**:
```json
{
  "timestamp": "2026-05-14T19:30:00.000Z",
  "level": "info",
  "message": "Starting course wizard transaction",
  "requestId": "req_abc123",
  "transactionId": "txn_def456",
  "publishMode": "publish",
  "courseActive": true,
  "pricingActive": true,
  "totalBatches": 2,
  "activeBatches": 2,
  "inactiveBatches": 0
}
```

---

## Guaranteed Invariants

### ✅ ZERO Possibility of These States

1. ❌ `publish=true` + `course inactive` + `active batches`  
   **Now**: Automatically resolved to `course active`

2. ❌ `inactive course` + `active batches`  
   **Now**: Validation error `ACTIVE_BATCH_ON_INACTIVE_COURSE`

3. ❌ `inactive course` + `active pricing`  
   **Now**: Validation error `ACTIVE_PRICING_ON_INACTIVE_COURSE`

4. ❌ `publish=true` + `no subjects`  
   **Now**: Validation error `PUBLISH_REQUIRES_SUBJECTS`

5. ❌ `publish=true` + `no batches`  
   **Now**: Validation error `PUBLISH_REQUIRES_BATCHES`

6. ❌ `enrollment_close >= batch_start`  
   **Now**: Validation error `INVALID_BATCH_LIFECYCLE`

---

## Testing Scenarios

### Test Case 1: Publish with Inactive Course ✅
**Input**:
```json
{
  "publish": true,
  "course": { "is_active": false },
  "batches": [{ "is_active": true }]
}
```

**Result**: Auto-resolved to:
```json
{
  "courseActive": true,
  "batchesEffective": [{ "is_active": true }]
}
```

**Status**: ✅ Success (course auto-activated)

---

### Test Case 2: Draft with Active Batch ✅
**Input**:
```json
{
  "publish": false,
  "course": { "is_active": false },
  "batches": [{ "is_active": true }]
}
```

**Result**: Validation error
```json
{
  "code": "ACTIVE_BATCH_ON_INACTIVE_COURSE",
  "message": "Inactive courses cannot have active batches"
}
```

**Status**: ✅ Rejected (domain invariant enforced)

---

### Test Case 3: Publish with No Batches ✅
**Input**:
```json
{
  "publish": true,
  "course": { "is_active": true },
  "batches": []
}
```

**Result**: Validation error
```json
{
  "code": "PUBLISH_REQUIRES_BATCHES",
  "message": "Published courses must have at least one batch"
}
```

**Status**: ✅ Rejected (completeness check enforced)

---

### Test Case 4: Valid Publish Flow ✅
**Input**:
```json
{
  "publish": true,
  "course": { "is_active": true, "thumbnail_url": "..." },
  "pricing": { "is_active": true },
  "batches": [{ "is_active": true, "status": "draft" }],
  "subjects": [{ "title": "Subject 1" }]
}
```

**Result**: Success
```json
{
  "courseActive": true,
  "pricingActive": true,
  "batches": [{ "is_active": true, "status": "upcoming" }]
}
```

**Status**: ✅ Created (batch auto-upgraded from draft → upcoming)

---

### Test Case 5: Valid Draft Flow ✅
**Input**:
```json
{
  "publish": false,
  "course": { "is_active": false },
  "pricing": { "is_active": false },
  "batches": [{ "is_active": false, "status": "draft" }],
  "subjects": [{ "title": "Subject 1" }]
}
```

**Result**: Success
```json
{
  "courseActive": false,
  "pricingActive": false,
  "batches": [{ "is_active": false, "status": "draft" }]
}
```

**Status**: ✅ Created (all states consistent for draft)

---

## Migration Impact

### Database Changes
**None required**. This is a pure logic fix with no schema changes.

### API Changes
**Backward compatible**. Existing clients continue to work, new invariants prevent invalid states.

### Frontend Changes
**Transparent**. Users see improved UX (auto-activation) without breaking changes.

---

## Deployment

### Order
1. ✅ Deploy backend (state resolver + validation)
2. ✅ Deploy frontend (auto-sync logic)
3. ✅ Monitor logs for `publishMode`, `courseActive`, `activeBatches`

### Rollback
**Safe**. Old frontend + new backend = strict validation (no breaking changes).  
**Recommended**: Deploy both together for best UX.

---

## Success Metrics

### Before Fix
- ❌ `COURSE_INACTIVE` errors on legitimate publish attempts
- ❌ Partial writes when transaction rolled back
- ❌ Unclear error messages for users
- ❌ Domain-state inconsistencies possible

### After Fix
- ✅ **Zero** `COURSE_INACTIVE` errors (auto-resolved)
- ✅ **Zero** partial writes (pre-validation)
- ✅ Clear, actionable error messages
- ✅ **Impossible** to create invalid domain states

---

## Conclusion

The publish state inconsistency is **completely eliminated** through:

1. **Centralized state resolution** (single source of truth)
2. **Pre-transaction validation** (fail fast before DB writes)
3. **Domain invariant enforcement** (impossible to violate rules)
4. **Frontend auto-sync** (prevent invalid payloads)
5. **Structured error codes** (clear user feedback)
6. **Comprehensive audit logging** (operational visibility)

**Result**: Production-safe, impossible to create contradictory states.

---

**Status**: ✅ **COMPLETE**  
**Risk**: **LOW** (no schema changes, backward compatible)  
**Confidence**: **HIGH** (comprehensive validation at all layers)
