/**
 * Course leaderboard DTO: name masking and student PII stripping.
 * Run: node tests/course-leaderboard.test.js
 */
import assert from 'node:assert/strict';
import {
  maskStudentDisplayName,
  studentEntryHasForbiddenPii,
  toAdminLeaderboardEntry,
  toStudentLeaderboardEntry,
} from '../src/dto/courseLeaderboard.dto.js';
import {
  formatLeaderboardRank,
  groupLeaderboardByPerformance,
  performanceBandForScore,
} from '../../client/src/features/leaderboard/normalizeLeaderboard.js';

function eq(actual, expected, name) {
  assert.equal(actual, expected, name);
  console.log(`  PASS ${name}`);
}

function run() {
  console.log('course-leaderboard — masking\n');

  eq(maskStudentDisplayName(''), 'Student', 'empty → Student');
  eq(maskStudentDisplayName('   '), 'Student', 'whitespace → Student');
  eq(maskStudentDisplayName('A'), '*', 'single letter');
  eq(maskStudentDisplayName('Ali'), 'A*i', 'three-letter token');
  eq(maskStudentDisplayName('Aamir Khan'), 'A***r K**n', 'first/last of each token');
  eq(maskStudentDisplayName('student@example.com'), 'Student', 'email not leaked');
  eq(maskStudentDisplayName('+923001234567'), 'Student', 'phone not leaked');

  console.log('\ncourse-leaderboard — student DTO allowlist\n');

  const student = toStudentLeaderboardEntry({
    rank: 1,
    displayName: 'Aamir Khan',
    averageScore: 87.26,
    testsTaken: 4,
    isCurrentStudent: true,
    studentId: 99,
    email: 'secret@example.com',
  });

  eq(student.displayName, 'A***r K**n', 'student name is masked');
  eq(student.averageScore, 87.3, 'average rounded to 1 decimal');
  eq(student.isCurrentStudent, true, 'current student flagged');
  assert.equal(student.studentId, undefined, 'studentId omitted');
  assert.equal(student.email, undefined, 'email omitted');
  eq(studentEntryHasForbiddenPii(student), false, 'allowlisted keys only');

  const dirty = { ...student, studentId: 12, email: 'a@b.c' };
  eq(studentEntryHasForbiddenPii(dirty), true, 'extra PII keys rejected by guard');

  console.log('\ncourse-leaderboard — admin DTO keeps identity\n');

  const admin = toAdminLeaderboardEntry({
    rank: 2,
    studentId: 15,
    fullName: 'Aamir Khan',
    averageScore: 70,
    testsTaken: 3,
    highestScore: 90,
    lowestScore: 50,
  });
  eq(admin.displayName, 'Aamir Khan', 'admin sees full name');
  eq(admin.studentId, 15, 'admin sees student id');
  eq(admin.highestScore, 90, 'admin high score');
  eq(admin.lowestScore, 50, 'admin low score');

  console.log('\ncourse-leaderboard — performance bands + global rank\n');

  eq(performanceBandForScore(96).id, 'excellent', '96 → excellent');
  eq(performanceBandForScore(80).id, 'excellent', '80 → excellent');
  eq(performanceBandForScore(79).id, 'strong', '79 → strong');
  eq(performanceBandForScore(60).id, 'strong', '60 → strong');
  eq(performanceBandForScore(59).id, 'developing', '59 → developing');
  eq(performanceBandForScore(40).id, 'developing', '40 → developing');
  eq(performanceBandForScore(39).id, 'improving', '39 → improving');
  eq(performanceBandForScore(12).id, 'improving', 'below 30 still improving');
  eq(formatLeaderboardRank(4), '#04', 'global rank padded');

  const grouped = groupLeaderboardByPerformance([
    { rank: 1, averageScore: 91 },
    { rank: 2, averageScore: 78 },
    { rank: 3, averageScore: 78 },
    { rank: 4, averageScore: 52 },
    { rank: 5, averageScore: 34 },
  ]);
  eq(grouped[0].entries.map((r) => r.rank).join(','), '1', 'excellent keeps rank 1');
  eq(grouped[1].entries.map((r) => r.rank).join(','), '2,3', 'strong keeps 2–3');
  eq(grouped[2].entries.map((r) => r.rank).join(','), '4', 'developing keeps 4');
  eq(grouped[3].entries.map((r) => r.rank).join(','), '5', 'improving keeps 5');

  console.log('\nAll unit checks passed.');
}

run();
