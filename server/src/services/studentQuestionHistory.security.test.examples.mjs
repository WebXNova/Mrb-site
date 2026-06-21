/**
 * Student Question History — security acceptance tests.
 *
 * Run: npm run test:student-question-history-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  mapDbStatusToStudentStatus,
  mapRowToStudentQuestionDetail,
  mapRowToStudentQuestionListItem,
  parseStudentQuestionId,
} from '../services/studentQuestionStudentView.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`file exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

function mustNotContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label} absent: "${needle}"`, !text.includes(needle));
  }
}

console.log('studentQuestionHistorySecurity — acceptance tests\n');

mustContain(
  'src/services/studentQuestionStudentView.service.js',
  [
    'WHERE sq.user_id = ?',
    'WHERE sq.id = ? AND sq.user_id = ?',
    'answer_attachment_url',
    'answer_audio_url',
    'answerImageUrl',
    'answerAudioUrl',
    'mapRowToStudentQuestionListItem',
    'mapRowToStudentQuestionDetail',
    'mapDbStatusToStudentStatus',
  ],
  'ownership queries + answer media'
);

mustNotContain(
  'src/services/studentQuestionStudentView.service.js',
  [
    'assignedTeacherId:',
    'assigned_teacher_id',
    'courseId:',
    'userId:',
    'answered_by',
    'answeredBy:',
  ],
  'student DTO privacy'
);

mustContain(
  'src/controllers/studentQuestions.controller.js',
  [
    'listStudentQuestionsForStudent',
    'getStudentQuestionDetailForStudent',
    'parseStudentQuestionId',
    'logStudentQuestionListViewed',
    'logStudentQuestionDetailViewed',
    'logStudentQuestionViewDenied',
    'QUESTION_NOT_FOUND',
  ],
  'controller uses student view + audit'
);

mustContain(
  'src/routes/student.routes.js',
  ['studentQuestionReadBurstLimit', 'studentQuestionReadStudentLimit', '/questions/:id'],
  'read rate limits'
);

mustContain(
  'src/services/studentQuestionViewAudit.service.js',
  [
    'student.question.list.viewed',
    'student.question.detail.viewed',
    'student.question.view.denied',
  ],
  'view audit events'
);

mustContain(
  'src/services/secureMedia.service.js',
  ['assertStudentOwnedTeacherQaAnswerMedia', "ns === 'teacher-qa'"],
  'student answer media ACL'
);

ok('parseStudentQuestionId rejects invalid', parseStudentQuestionId('abc') === null);
ok('parseStudentQuestionId accepts valid', parseStudentQuestionId('42') === 42);

ok(
  'pending maps to sent',
  mapDbStatusToStudentStatus({ status: 'pending', seen_at: null }) === 'sent'
);
ok(
  'seen_at maps to seen',
  mapDbStatusToStudentStatus({ status: 'pending', seen_at: '2026-01-01' }) === 'seen'
);
ok(
  'answered maps to answered',
  mapDbStatusToStudentStatus({ status: 'answered', answer: 'hi' }) === 'answered'
);

const listItem = mapRowToStudentQuestionListItem({
  id: 1,
  subject: 'physics',
  subject_title: 'Physics',
  title: 'Test',
  body: 'Body',
  status: 'pending',
  created_at: '2026-01-01',
  updated_at: '2026-01-02',
});
ok('list item has subjectLabel', listItem?.subjectLabel === 'Physics');
ok('list item has no assignedTeacherId', listItem?.assignedTeacherId === undefined);

const detail = mapRowToStudentQuestionDetail({
  id: 2,
  subject: 'chemistry',
  subject_title: 'Chemistry',
  title: 'Q',
  body: 'Student body',
  answer: 'Teacher reply text',
  answer_attachment_url: '/api/uploads/teacher-qa/5-img.jpg',
  answer_audio_url: '/api/uploads/teacher-qa/5-rec-abc.webm',
  status: 'answered',
  answered_at: '2026-01-03',
  created_at: '2026-01-01',
  updated_at: '2026-01-03',
});
ok('detail exposes answer text', detail?.answer === 'Teacher reply text');
ok('detail exposes answerImageUrl', detail?.answerImageUrl?.includes('teacher-qa'));
ok('detail exposes answerAudioUrl', detail?.answerAudioUrl?.includes('-rec-'));
ok('detail has no answeredBy', detail?.answeredBy === undefined);
ok('detail has hasAnswerMedia', detail?.hasAnswerMedia === true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
