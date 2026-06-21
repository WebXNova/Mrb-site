/**
 * Q&A audio recording upload security — malicious payload acceptance tests.
 *
 * Run: npm run test:qa-audio-upload-security
 */
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { detectAudioContainerFromFile } from '../src/utils/audioMagicBytes.js';
import {
  normalizeAudioUploadExtension,
  validateSecureAudioUpload,
} from '../src/utils/secureAudioValidation.js';
import {
  buildQaAudioFinalFilename,
  buildQaAudioUrl,
  QA_AUDIO_UPLOAD_NAMESPACES,
} from '../src/services/qaAudioUpload.service.js';
import { getQaAudioUploadConfig } from '../src/config/qaAudioUpload.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

const WEBM_EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const OGG_MAGIC = Buffer.from('OggS');
const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);

let passed = 0;
let failed = 0;
let tempDir = '';

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

function writeFixture(name, buffer) {
  const filePath = path.join(tempDir, name);
  writeFileSync(filePath, buffer);
  return filePath;
}

async function expectReject(label, filePath, originalName, claimedMime, expectedCode) {
  let code = null;
  try {
    await validateSecureAudioUpload({
      filePath,
      originalName,
      claimedMime,
      size: readFileSync(filePath).length,
      ...getQaAudioUploadConfig(),
    });
  } catch (error) {
    code = error?.code || null;
  }
  ok(`${label} → ${expectedCode}`, code === expectedCode);
}

function testExtensionGuards() {
  ok('blocks .mp3 extension', normalizeAudioUploadExtension('voice.mp3').ok === false);
  ok('blocks .wav extension', normalizeAudioUploadExtension('voice.wav').ok === false);
  ok('blocks double extension', normalizeAudioUploadExtension('x.php.webm').reason === 'double_extension');
  ok('blocks path traversal', normalizeAudioUploadExtension('../../x.webm').reason === 'invalid_filename');
  ok('allows .webm extension', normalizeAudioUploadExtension('rec.webm').ok === true);
}

function testMagicBytes() {
  const webm = writeFixture('sig.webm', Buffer.concat([WEBM_EBML, Buffer.alloc(300, 0)]));
  const ogg = writeFixture('sig.ogg', Buffer.concat([OGG_MAGIC, Buffer.alloc(300, 0)]));
  const junk = writeFixture('sig.bin', Buffer.alloc(300, 0));

  ok('detects webm EBML', detectAudioContainerFromFile(webm) === 'webm');
  ok('detects ogg magic', detectAudioContainerFromFile(ogg) === 'ogg');
  ok('rejects unknown signature', detectAudioContainerFromFile(junk) === null);
}

async function testMaliciousPayloads() {
  const tiny = writeFixture('tiny.webm', Buffer.alloc(100, 0));
  await expectReject('truncated tiny file', tiny, 'tiny.webm', 'audio/webm', 'AUDIO_TRUNCATED');

  const html = writeFixture('html.webm', Buffer.concat([WEBM_EBML, Buffer.from('<html><script>alert(1)</script>'), Buffer.alloc(300, 0)]));
  await expectReject('HTML in webm rejected', html, 'evil.webm', 'audio/webm', 'POLYGLOT_REJECTED');

  const jpeg = writeFixture('jpeg.webm', Buffer.concat([JPEG_SOI, Buffer.alloc(400, 0)]));
  await expectReject('JPEG bytes as webm', jpeg, 'fake.webm', 'audio/webm', 'INVALID_SIGNATURE');

  const mismatch = writeFixture('ogg.webm', Buffer.concat([OGG_MAGIC, Buffer.alloc(400, 0)]));
  await expectReject('OGG bytes with .webm ext', mismatch, 'rec.webm', 'audio/webm', 'EXTENSION_SIGNATURE_MISMATCH');

  const malformed = writeFixture('bad.webm', Buffer.concat([WEBM_EBML, Buffer.alloc(400, 0xab)]));
  await expectReject('malformed webm parse fail', malformed, 'bad.webm', 'audio/webm', 'AUDIO_PARSE_FAILED');
}

function testServiceWiring() {
  ok('student-qa audio namespace', QA_AUDIO_UPLOAD_NAMESPACES.has('student-qa'));
  ok('teacher-qa audio namespace', QA_AUDIO_UPLOAD_NAMESPACES.has('teacher-qa'));

  const name = buildQaAudioFinalFilename(9, '.webm');
  ok('filename has -rec- marker', name.startsWith('9-rec-') && name.endsWith('.webm'));

  const url = buildQaAudioUrl('student-qa', '9-rec-abc.webm');
  ok('secure media URL shape', url === '/api/uploads/student-qa/9-rec-abc.webm');

  const config = getQaAudioUploadConfig();
  ok('max duration 120s default', config.maxDurationSec === 120);
  ok('max bytes configured', config.maxBytes >= 1024 * 1024);
}

function testControllerWiring() {
  mustContain(
    'src/controllers/studentQuestionAudioUpload.controller.js',
    [
      'finalizeQaAudioUpload',
      'normalizeAudioUploadExtension',
      'UploadRejectedError',
      'generateQaAudioTempFilename',
    ],
    'student audio hardened'
  );

  mustContain(
    'src/controllers/teacherQuestionAnswerAudioUpload.controller.js',
    [
      'finalizeQaAudioUpload',
      'normalizeAudioUploadExtension',
      'UploadRejectedError',
    ],
    'teacher audio hardened'
  );

  mustContain(
    'src/services/qaAudioUpload.service.js',
    [
      'validateSecureAudioUpload',
      'validation_failed',
      'durationSec',
      'logActivity',
    ],
    'qa audio service pipeline'
  );

  mustContain(
    'src/utils/secureAudioValidation.js',
    ['parseFile', 'CODEC_NOT_ALLOWED', 'AUDIO_TOO_LONG', 'AUDIO_PARSE_FAILED'],
    'server-side audio validation'
  );

  mustNotContain(
    'src/controllers/studentQuestionAudioUpload.controller.js',
    ['req.body?.durationSec', 'x-mrb-qa-source', 'Math.random().toString(36)'],
    'student audio no client duration/header trust'
  );

  mustNotContain(
    'src/controllers/teacherQuestionAnswerAudioUpload.controller.js',
    ['req.body?.durationSec', 'x-mrb-qa-source', 'Math.random().toString(36)'],
    'teacher audio no client duration/header trust'
  );

  mustContain(
    'src/routes/student.routes.js',
    ['studentQuestionAudioUploadBurstLimit', 'studentQuestionAudioUploadIpLimit'],
    'student audio rate limits'
  );

  mustContain(
    'src/routes/teacher.routes.js',
    ['teacherAnswerAudioUploadBurstLimit', 'teacherAnswerAudioUploadIpLimit'],
    'teacher audio rate limits'
  );
}

console.log('qaAudioUploadSecurity — acceptance tests\n');

tempDir = mkdtempSync(path.join(tmpdir(), 'qa-audio-sec-'));

try {
  testExtensionGuards();
  testMagicBytes();
  await testMaliciousPayloads();
  testServiceWiring();
  testControllerWiring();
} finally {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
