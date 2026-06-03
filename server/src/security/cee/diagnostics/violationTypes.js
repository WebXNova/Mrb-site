/**
 * CEE scope violation taxonomy — stable for SIEM / observability pipelines.
 */

export const VIOLATION_SCHEMA_VERSION = 'cee.violation.1';

/** @typedef {'critical'|'high'|'medium'} CeeViolationSeverity */

export const CEE_VIOLATION_TYPES = Object.freeze({
  MISSING_COURSE_SCOPE: 'MISSING_COURSE_SCOPE',
  UNSCOPED_PROTECTED_QUERY: 'UNSCOPED_PROTECTED_QUERY',
  INVALID_BYPASS: 'INVALID_BYPASS',
  BUILDER_SCOPE_REQUIRED: 'BUILDER_SCOPE_REQUIRED',
});

export const CEE_VIOLATION_SIEM_TAG = 'cee.violation.report';

export const CEE_VIOLATION_ACTIVITY_ACTION = 'cee.security.violation';
