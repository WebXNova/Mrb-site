/**
 * Public homepage stats / features / testimonials.
 *
 * - `platformStats`  -> fake analytics numbers (Active Students count,
 *                       Lecture/Test counts, doubt response time).
 *                       Removed; should be sourced from a real
 *                       `/api/public/platform-stats` (or similar)
 *                       endpoint when wired up.
 * - `testimonials`   -> seeded student quotes used as demo content.
 *                       Removed; should be sourced from real
 *                       backend-managed testimonials (CMS / admin
 *                       moderated) when wired up.
 * - `features`       -> static marketing copy describing the
 *                       platform's actual capabilities (Lectures,
 *                       Tests, Doubts, Code-based access). This is
 *                       site copy, not sample data, and is preserved.
 *
 * Components that consume `platformStats` / `testimonials` already
 * map over the array, so an empty array renders an empty grid
 * without breaking layout.
 */

export const platformStats = [];

export const features = [
  {
    id: 'lectures',
    title: 'Structured Video Lectures',
    description:
      'Topic-wise lectures from senior faculty, organized so you always know what to study next.',
    icon: 'play',
  },
  {
    id: 'tests',
    title: 'Test Engine That Teaches',
    description:
      'Timed MCQ tests, instant grading, and detailed explanations for every question \u2014 not just answers.',
    icon: 'check',
  },
  {
    id: 'doubts',
    title: 'Subject-Tagged Doubts',
    description:
      'Ask in Physics, Chemistry, or Biology. Your question reaches the right teacher and comes back with a real answer.',
    icon: 'chat',
  },
  {
    id: 'access',
    title: 'Verified, Code-Based Access',
    description:
      'Each MRB student gets a unique enrollment code. No spam accounts, no distractions \u2014 just a clean classroom.',
    icon: 'shield',
  },
];

export const testimonials = [];
