/**
 * Q&A image upload security — malicious payload acceptance tests.
 *
 * Run: npm run test:qa-image-upload-security
 */
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import {
  normalizeUploadExtension,
  validateSecureRasterImageUpload,
} from '../src/utils/secureRasterImageValidation.js';
import {
  buildQaFinalFilename,
  buildQaImageUrl,
  QA_IMAGE_UPLOAD_NAMESPACES,
} from '../src/services/qaImageUpload.service.js';
import { getQaImageUploadConfig } from '../src/config/qaImageUpload.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

/** 1×1 PNG (valid raster). */
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** JPEG SOI marker only (not a decodable image — signature probe only). */
const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

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

function expectReject(label, filePath, originalName, claimedMime, expectedCode) {
  let code = null;
  try {
    validateSecureRasterImageUpload({
      filePath,
      originalName,
      claimedMime,
      size: Buffer.byteLength(readFileSync(filePath)),
      maxBytes: getQaImageUploadConfig().maxBytes,
    });
  } catch (error) {
    code = error?.code || null;
  }
  ok(`${label} → ${expectedCode}`, code === expectedCode);
}

function expectAccept(label, filePath, originalName, claimedMime) {
  let accepted = false;
  try {
    const result = validateSecureRasterImageUpload({
      filePath,
      originalName,
      claimedMime,
      size: Buffer.byteLength(readFileSync(filePath)),
      maxBytes: getQaImageUploadConfig().maxBytes,
    });
    accepted = result.kind === 'png' && result.extension === '.png';
  } catch {
    accepted = false;
  }
  ok(label, accepted);
}

function testExtensionGuards() {
  const blockedSvg = normalizeUploadExtension('photo.svg');
  ok('blocks .svg extension', blockedSvg.ok === false && blockedSvg.reason === 'blocked_extension');

  const blockedGif = normalizeUploadExtension('anim.gif');
  ok('blocks .gif extension', blockedGif.ok === false && blockedGif.reason === 'blocked_extension');

  const doubleExt = normalizeUploadExtension('shell.php.jpg');
  ok('blocks double extension', doubleExt.ok === false && doubleExt.reason === 'double_extension');

  const traversal = normalizeUploadExtension('../../etc/passwd.jpg');
  ok('blocks path traversal in name', traversal.ok === false && traversal.reason === 'invalid_filename');

  const allowed = normalizeUploadExtension('photo.jpg');
  ok('allows .jpg extension', allowed.ok === true && allowed.ext === '.jpg');
}

function testMaliciousPayloads() {
  tempDir = mkdtempSync(path.join(tmpdir(), 'qa-upload-sec-'));

  const validPng = writeFixture('valid.png', MINIMAL_PNG);
  expectAccept('valid minimal PNG accepted', validPng, 'valid.png', 'image/png');

  const phpJpeg = writeFixture(
    'php.jpg',
    Buffer.concat([JPEG_SOI, Buffer.from('<?php system($_GET["c"]); ?>')])
  );
  expectReject('PHP polyglot in JPEG rejected', phpJpeg, 'evil.jpg', 'image/jpeg', 'POLYGLOT_REJECTED');

  const htmlInPng = writeFixture(
    'html.png',
    Buffer.concat([MINIMAL_PNG, Buffer.from('<script>alert(1)</script>')])
  );
  expectReject('HTML/script appended to PNG rejected', htmlInPng, 'html.png', 'image/png', 'POLYGLOT_REJECTED');

  const zipPolyglot = writeFixture(
    'zip.jpg',
    Buffer.concat([JPEG_SOI, Buffer.from('PK\x03\x04'), Buffer.alloc(64, 0)])
  );
  expectReject('ZIP marker in JPEG rejected', zipPolyglot, 'zip.jpg', 'image/jpeg', 'POLYGLOT_REJECTED');

  const svgContent = writeFixture(
    'fake.jpg',
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  );
  expectReject('SVG content with .jpg rejected', svgContent, 'fake.jpg', 'image/jpeg', 'INVALID_SIGNATURE');

  const htmlOnly = writeFixture('page.jpg', Buffer.from('<html><body>evil</body></html>'));
  expectReject('HTML-only payload rejected', htmlOnly, 'page.jpg', 'image/jpeg', 'INVALID_SIGNATURE');

  const mismatch = writeFixture('mismatch.jpg', MINIMAL_PNG);
  expectReject(
    'PNG bytes with .jpg extension rejected',
    mismatch,
    'mismatch.jpg',
    'image/jpeg',
    'EXTENSION_SIGNATURE_MISMATCH'
  );

  const mimeSpoof = writeFixture('spoof.png', MINIMAL_PNG);
  let mimeMismatch = false;
  try {
    const result = validateSecureRasterImageUpload({
      filePath: mimeSpoof,
      originalName: 'spoof.png',
      claimedMime: 'image/jpeg',
      size: MINIMAL_PNG.length,
    });
    mimeMismatch = result.mimeMismatch === true;
  } catch {
    mimeMismatch = false;
  }
  ok('MIME spoof logged via mimeMismatch flag', mimeMismatch);
}

function testQaServiceWiring() {
  ok('student-qa namespace registered', QA_IMAGE_UPLOAD_NAMESPACES.has('student-qa'));
  ok('teacher-qa namespace registered', QA_IMAGE_UPLOAD_NAMESPACES.has('teacher-qa'));

  const studentName = buildQaFinalFilename('student-qa', 42, '.png');
  ok('student filename has user prefix', studentName.startsWith('42-') && studentName.endsWith('.png'));
  ok('student filename excludes -rec-', !studentName.includes('-rec-'));

  const teacherUrl = buildQaImageUrl('teacher-qa', '7-abc123.png');
  ok('teacher URL under secure media path', teacherUrl === '/api/uploads/teacher-qa/7-abc123.png');

  const config = getQaImageUploadConfig();
  ok('max bytes configured', config.maxBytes >= 1024 * 1024);
  ok('dimension limits configured', config.maxWidth > 0 && config.maxHeight > 0 && config.maxPixels > 0);
}

function testControllerWiring() {
  mustContain(
    'src/controllers/studentQuestionUpload.controller.js',
    [
      'finalizeQaImageUpload',
      'normalizeUploadExtension',
      'UploadRejectedError',
      'generateQaTempUploadFilename',
    ],
    'student upload hardened'
  );

  mustContain(
    'src/controllers/teacherQuestionAnswerUpload.controller.js',
    [
      'finalizeQaImageUpload',
      'normalizeUploadExtension',
      'UploadRejectedError',
      'generateQaTempUploadFilename',
    ],
    'teacher upload hardened'
  );

  mustContain(
    'src/services/qaImageUpload.service.js',
    [
      'validateSecureRasterImageUpload',
      'reencodeValidatedRasterImage',
      'validation_failed',
      'logActivity',
    ],
    'qa upload service pipeline'
  );

  mustNotContain(
    'src/controllers/studentQuestionUpload.controller.js',
    ['Math.random().toString(36)', 'allowedExt.has(extRaw)'],
    'student controller no weak filename trust'
  );

  mustNotContain(
    'src/controllers/teacherQuestionAnswerUpload.controller.js',
    ['Math.random().toString(36)'],
    'teacher controller no weak filename generation'
  );
}

console.log('qaImageUploadSecurity — acceptance tests\n');

try {
  testExtensionGuards();
  testMaliciousPayloads();
  testQaServiceWiring();
  testControllerWiring();
} finally {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
