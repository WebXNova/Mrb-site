/** Canonical lifecycle values for `course_batches.status` (lowercase). */
export const COURSE_BATCH_STATUSES = [
  'draft',
  'published',
  'upcoming',
  'enrollment_open',
  'running',
  'completed',
  'cancelled',
  'archived',
];

/** Statuses exposed on the public catalog batch list (active operational cohorts). */
export const COURSE_BATCH_PUBLIC_STATUSES = ['published', 'upcoming', 'enrollment_open', 'running'];
