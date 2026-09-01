function asNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asString(value, fallback = '') {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] != null && row[key] !== '') return row[key];
  }
  return undefined;
}

export function formatScorePercent(value) {
  const n = asNumber(value);
  if (n == null) return '—';
  const rounded = Math.round(n * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}%`;
}

export function looksMaskedName(name) {
  const s = asString(name);
  if (!s) return false;
  return /[*•·…]/.test(s) || /^[A-Za-z]\.?\s*$/.test(s);
}

export function looksLikeEmailOrPhone(name) {
  const s = asString(name);
  return /@/.test(s) || /^\+?\d[\d\s-]{8,}$/.test(s);
}

export function sanitizeStudentDisplayName(name, { isCurrentStudent = false } = {}) {
  const s = asString(name, 'Student');
  if (looksLikeEmailOrPhone(s)) return isCurrentStudent ? 'You' : 'Student';
  return s;
}

export function normalizeLeaderboardEntry(row, { studentView = false } = {}) {
  if (!row || typeof row !== 'object') return null;
  const rank = asNumber(pick(row, 'rank', 'rankPosition', 'rank_position', 'position'), 0);
  const isCurrentStudent = Boolean(
    pick(row, 'isCurrentStudent', 'is_current_student', 'isSelf', 'is_self', 'isYou', 'is_you')
  );
  const rawName = asString(
    pick(row, 'displayName', 'display_name', 'maskedName', 'masked_name', 'fullName', 'full_name', 'name', 'studentName', 'student_name'),
    'Student'
  );
  const displayName = studentView
    ? sanitizeStudentDisplayName(rawName, { isCurrentStudent })
    : rawName;
  const average = asNumber(
    pick(row, 'averageScore', 'average_score', 'averagePercentage', 'average_percentage', 'avgScore', 'avg_score'),
    0
  );
  const testsTaken = asNumber(
    pick(row, 'testsTaken', 'tests_taken', 'totalTests', 'total_tests', 'gradedAttempts', 'graded_attempts'),
    0
  );
  return {
    rank,
    studentId: asNumber(pick(row, 'studentId', 'student_id', 'userId', 'user_id'), null),
    displayName,
    rawName,
    isCurrentStudent,
    isMasked: looksMaskedName(displayName),
    averageScore: average,
    testsTaken,
    highestScore: asNumber(pick(row, 'highestScore', 'highest_score', 'maxScore', 'max_score'), null),
    lowestScore: asNumber(pick(row, 'lowestScore', 'lowest_score', 'minScore', 'min_score'), null),
  };
}

export function unwrapLeaderboardPayload(response) {
  const data = response?.data ?? response ?? {};
  const rows = data.entries ?? data.items ?? data.leaderboard ?? data.rows ?? (Array.isArray(data) ? data : []);
  const list = Array.isArray(rows) ? rows : [];
  return {
    courseId: asNumber(data.courseId ?? data.course_id, null),
    courseTitle: asString(data.courseTitle ?? data.course_title ?? data.courseName ?? data.course_name, ''),
    entries: list,
  };
}

export const LEADERBOARD_PERFORMANCE_BANDS = Object.freeze([
  { id: 'excellent', min: 80, label: 'Excellent', rangeLabel: '80–100%', title: 'Excellent performance' },
  { id: 'strong', min: 60, label: 'Strong', rangeLabel: '60–79%', title: 'Strong performance' },
  { id: 'developing', min: 40, label: 'Developing', rangeLabel: '40–59%', title: 'Developing performance' },
  { id: 'improving', min: 0, label: 'Improving', rangeLabel: '30–39%', title: 'Improving performance' },
]);

export function performanceBandForScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n < 40) return LEADERBOARD_PERFORMANCE_BANDS[3];
  if (n >= 80) return LEADERBOARD_PERFORMANCE_BANDS[0];
  if (n >= 60) return LEADERBOARD_PERFORMANCE_BANDS[1];
  return LEADERBOARD_PERFORMANCE_BANDS[2];
}

export function formatLeaderboardRank(rank) {
  const n = Math.max(0, Math.floor(Number(rank) || 0));
  return `#${String(n).padStart(2, '0')}`;
}

/**
 * Group a globally ranked list into the four performance bands.
 * Rank order is preserved; ranking does not restart per section.
 * Scores below 30% still appear in Improving so every eligible student is shown.
 */
export function groupLeaderboardByPerformance(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return LEADERBOARD_PERFORMANCE_BANDS.map((band) => ({
    ...band,
    entries: list.filter((row) => performanceBandForScore(row.averageScore).id === band.id),
  }));
}

export function normalizeStudentLeaderboard(response) {
  const payload = unwrapLeaderboardPayload(response);
  const entries = payload.entries
    .map((row) => normalizeLeaderboardEntry(row, { studentView: true }))
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || b.averageScore - a.averageScore)
    .map((row) => {
      const band = performanceBandForScore(row.averageScore);
      return {
        ...row,
        performanceLabel: band.label,
        performanceBandId: band.id,
      };
    });
  return { ...payload, entries, bands: groupLeaderboardByPerformance(entries) };
}

export function normalizeAdminLeaderboard(response) {
  const payload = unwrapLeaderboardPayload(response);
  const entries = payload.entries
    .map((row) => normalizeLeaderboardEntry(row, { studentView: false }))
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || b.averageScore - a.averageScore);
  return { ...payload, entries };
}

function flattenEnrollment(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const nested = raw.enrollment && typeof raw.enrollment === 'object' ? raw.enrollment : raw;
  const profile = nested.profile && typeof nested.profile === 'object' ? nested.profile : {};
  const merged = { ...profile, ...nested };
  return {
    fullName: asString(
      pick(merged, 'applicantFullName', 'applicant_full_name', 'fullName', 'full_name', 'name', 'studentName')
    ),
    fatherName: asString(pick(merged, 'fatherName', 'father_name')),
    email: asString(pick(merged, 'email')),
    whatsapp: asString(pick(merged, 'whatsappNumber', 'whatsapp_number', 'phone', 'contact')),
    gender: asString(pick(merged, 'gender')),
    dateOfBirth: asString(pick(merged, 'dateOfBirth', 'date_of_birth', 'dob')),
    city: asString(pick(merged, 'cityName', 'city_name', 'city')),
    district: asString(pick(merged, 'districtName', 'district_name', 'district')),
    province: asString(pick(merged, 'provinceName', 'province_name', 'province')),
    hsscStatus: asString(pick(merged, 'hsscStatus', 'hssc_status', 'classLevel', 'educationLevel')),
    mdcatAttemptType: asString(pick(merged, 'mdcatAttemptType', 'mdcat_attempt_type')),
    board: asString(pick(merged, 'boardName', 'board_name', 'board')),
  };
}

function normalizeAttempt(row) {
  if (!row || typeof row !== 'object') return null;
  const percentage = asNumber(
    pick(row, 'percentage', 'percent', 'scorePercent', 'score_percent', 'obtainedPercentage'),
    null
  );
  const passedRaw = pick(row, 'passed', 'isPassed', 'is_passed', 'passFail', 'pass_fail');
  let passed = null;
  if (typeof passedRaw === 'boolean') passed = passedRaw;
  else if (typeof passedRaw === 'string') {
    const s = passedRaw.toLowerCase();
    if (s === 'pass' || s === 'passed' || s === 'true') passed = true;
    if (s === 'fail' || s === 'failed' || s === 'false') passed = false;
  }
  return {
    id: pick(row, 'id', 'attemptId', 'attempt_id', 'resultId'),
    testName: asString(pick(row, 'testName', 'test_name', 'title', 'testTitle', 'test_title'), 'Test'),
    takenAt: pick(row, 'takenAt', 'taken_at', 'submittedAt', 'submitted_at', 'completedAt', 'completed_at', 'createdAt'),
    score: asString(
      pick(row, 'scoreLabel', 'score_label') ??
        (pick(row, 'score', 'marksObtained', 'marks_obtained') != null
          ? String(pick(row, 'score', 'marksObtained', 'marks_obtained'))
          : '')
    ),
    percentage,
    passed,
  };
}

export function normalizeLeaderboardDetail(response) {
  const data = response?.data ?? response ?? {};
  const enrollment = flattenEnrollment(data);
  const historyRaw =
    data.attempts ??
    data.testHistory ??
    data.test_history ??
    data.history ??
    data.results ??
    [];
  return {
    enrollment,
    attempts: (Array.isArray(historyRaw) ? historyRaw : []).map(normalizeAttempt).filter(Boolean),
  };
}
