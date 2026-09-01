/**
 * Leaderboard DTOs — student responses never include identifiers or contact PII.
 */

const STUDENT_ENTRY_KEYS = Object.freeze([
  'rank',
  'displayName',
  'averageScore',
  'testsTaken',
  'isCurrentStudent',
]);

const PII_KEY_PATTERN =
  /email|phone|whatsapp|mobile|student.?id|user.?id|enrollment|father|cnic|address|username/i;

/**
 * Mask a display name: keep first and last letter of each token, asterisks in between.
 * Emails, phones, and empty values become a generic label — never returned as-is.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function maskStudentDisplayName(raw) {
  const s = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return 'Student';
  if (/@/.test(s) || /^\+?\d[\d\s-]{8,}$/.test(s)) return 'Student';

  return s
    .split(' ')
    .map((token) => maskNameToken(token))
    .join(' ');
}

/**
 * @param {string} token
 */
function maskNameToken(token) {
  const chars = Array.from(token);
  if (chars.length === 0) return '';
  if (chars.length === 1) return '*';
  if (chars.length === 2) return `${chars[0]}*`;
  const innerLen = Math.min(chars.length - 2, 12);
  return `${chars[0]}${'*'.repeat(innerLen)}${chars[chars.length - 1]}`;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function roundLeaderboardScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/**
 * Student board row. Explicit allowlist — never spread a SQL row.
 *
 * @param {{
 *   rank: number,
 *   displayName: string,
 *   averageScore: number,
 *   testsTaken: number,
 *   isCurrentStudent: boolean,
 * }} input
 */
export function toStudentLeaderboardEntry(input) {
  return {
    rank: Number(input.rank) || 0,
    displayName: maskStudentDisplayName(input.displayName),
    averageScore: roundLeaderboardScore(input.averageScore),
    testsTaken: Math.max(0, Math.floor(Number(input.testsTaken) || 0)),
    isCurrentStudent: Boolean(input.isCurrentStudent),
  };
}

/**
 * @param {unknown} entry
 * @returns {boolean}
 */
export function studentEntryHasForbiddenPii(entry) {
  if (!entry || typeof entry !== 'object') return true;
  const keys = Object.keys(entry);
  if (keys.some((key) => !STUDENT_ENTRY_KEYS.includes(key))) return true;
  if (keys.some((key) => PII_KEY_PATTERN.test(key))) return true;
  const blob = JSON.stringify(entry);
  return /@/.test(blob) || /"studentId"/.test(blob) || /"student_id"/.test(blob);
}

/**
 * Admin board row — full name + student id + high/low. Still no email/phone.
 *
 * @param {{
 *   rank: number,
 *   studentId: number,
 *   fullName: string,
 *   averageScore: number,
 *   testsTaken: number,
 *   highestScore: number,
 *   lowestScore: number,
 * }} input
 */
export function toAdminLeaderboardEntry(input) {
  const fullName = String(input.fullName ?? '').trim() || 'Student';
  return {
    rank: Number(input.rank) || 0,
    studentId: Number(input.studentId) || 0,
    displayName: fullName,
    fullName,
    averageScore: roundLeaderboardScore(input.averageScore),
    testsTaken: Math.max(0, Math.floor(Number(input.testsTaken) || 0)),
    highestScore: roundLeaderboardScore(input.highestScore),
    lowestScore: roundLeaderboardScore(input.lowestScore),
  };
}

/**
 * @param {object|null} row
 */
export function toAdminEnrollmentDetail(row) {
  if (!row) {
    return {
      applicantFullName: '',
      fatherName: '',
      email: '',
      whatsappNumber: '',
      gender: '',
      dateOfBirth: null,
      cityName: '',
      districtName: '',
      provinceName: '',
      hsscStatus: '',
      mdcatAttemptType: '',
      boardName: '',
    };
  }
  return {
    applicantFullName: String(row.applicant_full_name ?? '').trim(),
    fatherName: String(row.father_name ?? '').trim(),
    email: String(row.email ?? '').trim(),
    whatsappNumber: String(row.whatsapp_number ?? '').trim(),
    gender: String(row.gender ?? '').trim(),
    dateOfBirth: row.date_of_birth == null ? null : String(row.date_of_birth),
    cityName: String(row.city_name ?? '').trim(),
    districtName: String(row.district_name ?? '').trim(),
    provinceName: String(row.province_name ?? '').trim(),
    hsscStatus: String(row.hssc_status ?? '').trim(),
    mdcatAttemptType: String(row.mdcat_attempt_type ?? '').trim(),
    boardName: String(row.board_name ?? '').trim(),
  };
}

/**
 * @param {object} row
 */
export function toAdminAttemptDetail(row) {
  const passStatus = String(row.pass_status ?? '').toUpperCase();
  const passed = passStatus === 'PASS';
  const score = row.score == null ? null : Number(row.score);
  const maxScore = row.max_score == null ? null : Number(row.max_score);
  const percentage = roundLeaderboardScore(row.percentage);
  return {
    id: Number(row.attempt_id) || null,
    testName: String(row.test_title ?? 'Test').trim() || 'Test',
    submittedAt: row.submitted_at == null ? null : String(row.submitted_at),
    score: score == null || !Number.isFinite(score) ? '' : String(score),
    maxScore: maxScore == null || !Number.isFinite(maxScore) ? null : maxScore,
    percentage,
    passed,
    passFail: passed ? 'pass' : 'fail',
  };
}

export { STUDENT_ENTRY_KEYS };
