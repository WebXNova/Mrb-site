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
 *                       Tests, Doubts, secure portal access).
 *
 * Components that consume `platformStats` / `testimonials` already
 * map over the array, so an empty array renders an empty grid
 * without breaking layout.
 */

export const platformStats = [
  { value: '12K+', label: 'students' },
  { value: '500+', label: 'Tests' },
  { value: '100+', label: 'recorded lectures' },
  { value: '24/7', label: 'student support' },
];

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
    title: 'Secure student portal',
    description:
      'Sign in once to reach lectures, tests, and doubts in a calm, distraction-free dashboard.',
    icon: 'shield',
  },
];

export const testimonials = [
  {
    id: 'remark-1',
    quote:
      'MRB test explanations changed how I revise. Every wrong answer came back with a clear reason — my mock scores jumped from the 60s to 90+ before MDCAT.',
    name: 'Ayesha Khan',
    role: 'MDCAT Qualifier, Lahore',
    verified: true,
  },
  {
    id: 'remark-2',
    quote:
      'The lecture playlist and subject-wise tests kept me on track when self-study felt overwhelming. I always knew what to study next.',
    name: 'Hassan Ali',
    role: 'MDCAT Qualifier, Faisalabad',
    verified: true,
  },
  {
    id: 'remark-3',
    quote:
      'Doubts were answered properly — not copy-paste replies. That support made the difference in Biology and Chemistry during my final month.',
    name: 'Fatima Raza',
    role: 'MDCAT Qualifier, Multan',
    verified: true,
  },
];
