export const TEST_ACCESS_TYPE_COURSE_LOCKED = 'course_locked';
export const TEST_ACCESS_TYPE_FREE_STANDALONE = 'free_standalone';
export const TEST_ACCESS_TYPE_PAID_STANDALONE = 'paid_standalone';

export const TEST_ACCESS_TYPE_OPTIONS = Object.freeze([
  {
    value: TEST_ACCESS_TYPE_COURSE_LOCKED,
    label: 'Course-linked',
    description: 'Assigned to a course. Only students actively enrolled in that course can start the test.',
  },
  {
    value: TEST_ACCESS_TYPE_FREE_STANDALONE,
    label: 'Free standalone',
    description: 'No course assignment. Scheduling and optional seat limits are set in Settings.',
  },
  {
    value: TEST_ACCESS_TYPE_PAID_STANDALONE,
    label: 'Paid standalone',
    description: 'No course assignment. Students register and pay; approval confirms a seat, not exam access.',
  },
]);

export function isStandaloneAccessType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === TEST_ACCESS_TYPE_FREE_STANDALONE || normalized === TEST_ACCESS_TYPE_PAID_STANDALONE;
}
