-- Persist explicit course-switch confirmation (idempotent via ensureEnrollmentSwitchConfirmedSchema.js)
ALTER TABLE enrollments
  ADD COLUMN switch_confirmed_at TIMESTAMP NULL DEFAULT NULL,
  ALGORITHM=INSTANT, LOCK=NONE;
