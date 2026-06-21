/** Merge API payloads with safe defaults so portal pages never read .length on undefined. */
export function normaliseStudentDashboard(raw) {
  const base = {
    progressPercent: 0,
    testsCompleted: 0,
    lecturesCompleted: 0,
    questionsAsked: 0,
    lectures: [],
    tests: [],
    results: [],
    questions: [],
    recentActivity: [],
    courses: [],
    notifications: [],
    sessions: [],
    progress: null,
  };
  if (!raw || typeof raw !== 'object') {
    return { ...base };
  }
  const lectures = Array.isArray(raw.lectures) ? raw.lectures : [];
  const tests = Array.isArray(raw.tests) ? raw.tests : [];
  const results = Array.isArray(raw.results) ? raw.results : [];
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  const recentActivity = Array.isArray(raw.recentActivity) ? raw.recentActivity : [];
  const courses = Array.isArray(raw.courses) ? raw.courses : [];
  const notifications = Array.isArray(raw.notifications) ? raw.notifications : [];
  const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  const progress = raw.progress && typeof raw.progress === 'object' ? raw.progress : null;

  const progressPercent = Number.isFinite(Number(raw.progressPercent)) ? Number(raw.progressPercent) : 0;
  const testsCompleted = Number.isFinite(Number(raw.testsCompleted)) ? Number(raw.testsCompleted) : 0;
  const lecturesCompleted = Number.isFinite(Number(raw.lecturesCompleted)) ? Number(raw.lecturesCompleted) : 0;
  const questionsAsked = Number.isFinite(Number(raw.questionsAsked)) ? Number(raw.questionsAsked) : 0;

  return {
    ...base,
    ...raw,
    lectures,
    tests,
    results,
    questions,
    courses,
    notifications,
    sessions,
    recentActivity,
    progress,
    progressPercent,
    testsCompleted,
    lecturesCompleted,
    questionsAsked,
  };
}
