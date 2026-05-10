/**
 * Student dashboard fallback shape.
 *
 * NOTE: This object intentionally contains NO sample/demo data.
 * It exists only as a render-safe default so that pages depending on
 * arrays (lectures, tests, results, questions, notifications, sessions,
 * recentActivity) never crash on `.map` / `.length` while the real
 * backend response is loading or unavailable.
 *
 * The exported name `mockStudentDashboard` is preserved to avoid
 * touching the import surface of pages that already reference it.
 *
 * Replace usage with real `studentApi.dashboard()` data — this file
 * should not contain content that is rendered to the user.
 */
export const mockStudentDashboard = {
  progressPercent: 0,
  testsCompleted: 0,
  questionsAsked: 0,
  lectures: [],
  tests: [],
  results: [],
  questions: [],
  notifications: [],
  recentActivity: [],
  sessions: [],
};
