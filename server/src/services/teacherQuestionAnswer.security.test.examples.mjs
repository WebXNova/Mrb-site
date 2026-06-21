/**
 * Teacher Question Answer — security acceptance tests.
 *
 * Run: npm run test:teacher-question-answer-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

console.log('teacherQuestionAnswerSecurity — acceptance tests\n');

mustContain(
  'src/services/teacherQuestionAnswer.service.js',
  [
    'sanitizePlainText',
    'assertTeacherIsOperational',
    'WHERE sq.id = ? AND sq.assigned_teacher_id = ?',
    'FOR UPDATE',
    "status = 'answered'",
    'already_answered',
    'affectedRows',
    'seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP)',
    'normalizeTeacherAnswerUrl',
    '-rec-',
  ],
  'answer service transaction + XSS + replay guard'
);

mustContain(
  'src/validators/teacherQuestionAnswer.schema.js',
  ['.strict()', '/api/uploads/teacher-qa/', '-rec-'],
  'answer schema strict URLs'
);

mustContain(
  'src/controllers/teacherQuestions.controller.js',
  [
    'postTeacherQuestionAnswer',
    'teacherQuestionAnswerBodySchema',
    'logTeacherQuestionAnswerCreated',
    'logTeacherQuestionAnswerRejected',
    'ANSWER_ALREADY_EXISTS',
  ],
  'answer controller'
);

mustContain(
  'src/routes/teacher.routes.js',
  [
    '/questions/answer/attachment',
    '/questions/answer/recording',
    '/questions/:questionId/answer',
    'requireCsrf',
    'idempotencyMiddleware',
    'postTeacherQuestionAnswer',
  ],
  'answer routes + CSRF + idempotency'
);

mustContain(
  'src/controllers/teacherQuestionAnswerUpload.controller.js',
  ['finalizeQaImageUpload', 'normalizeUploadExtension', 'UploadRejectedError', 'teacher-qa'],
  'image upload validation'
);

mustContain(
  'src/controllers/teacherQuestionAnswerAudioUpload.controller.js',
  ['finalizeQaAudioUpload', 'normalizeAudioUploadExtension', 'UploadRejectedError', 'generateQaAudioTempFilename'],
  'recorder audio upload hardened'
);

mustContain(
  'src/services/secureMedia.service.js',
  [
    "ns === 'teacher-qa'",
    'assertStudentOwnedTeacherQaAnswerMedia',
    'answer_attachment_url',
    'answer_audio_url',
  ],
  'teacher-qa media ACL'
);

mustContain(
  'src/security/cee/protectionGrid.js',
  ['uploads_teacher_qa', 'teacher-qa'],
  'protection grid teacher-qa'
);

mustContain(
  'src/db/ensureStudentQuestionsFoundationSchema.js',
  ['answer_attachment_url', 'answer_audio_url'],
  'answer media columns'
);

mustContain(
  'src/services/teacherQuestionDetailAudit.service.js',
  ['teacher.question.answer.created', 'teacher.question.answer.rejected'],
  'answer audit events'
);

mustNotContain(
  'src/services/teacherQuestionAnswer.service.js',
  ['req.body.assignedTeacherId', 'req.params.teacherId'],
  'no client-controlled ownership'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
