/** Merge API payloads with safe defaults so portal pages never read .length on undefined. */
export function normaliseStudentDashboard(raw) {
  const base = {
    progressPercent: 0,
    testsCompleted: 0,
    questionsAsked: 0,
    lectures: [],
    tests: [],
    results: [],
    questions: [],
    recentActivity: [],
    courses: [],
    notifications: [],
    sessions: [],
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

  let progressPercent = Number(raw.progressPercent);
  if (Number.isNaN(progressPercent)) {
    progressPercent = Math.min(
      100,
      Math.max(0, results.length * 8 + (lectures.length ? 12 : 0))
    );
  }

  let testsCompleted = Number(raw.testsCompleted);
  if (Number.isNaN(testsCompleted)) {
    testsCompleted = results.length || 0;
  }

  let questionsAsked = Number(raw.questionsAsked);
  if (Number.isNaN(questionsAsked)) {
    questionsAsked = questions.length;
  }

  const mergedRecent =
    recentActivity.length > 0
      ? recentActivity
      : lectures.slice(0, 5).map((l) => `New lecture: ${l.title || 'Untitled'}`);

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
    recentActivity: mergedRecent,
    progressPercent,
    testsCompleted,
    questionsAsked,
  };
}
