/**
 * Course thumbnail upload security verification.
 *
 * Run: npm run test:course-image-upload-security
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
  buildCourseImageUrl,
  COURSE_UPLOAD_MAX_BYTES,
  COURSE_UPLOAD_NAMESPACE,
  generateCourseTempUploadFilename,
} from '../src/services/courseImageUpload.service.js';
import { COURSE_UPLOAD_FILENAME_PATTERN } from '../src/constants/secureMedia.constants.js';
import {
  parseCatalogMediaUploadPath,
  signCatalogMediaPath,
  signCatalogMediaUrl,
  verifyCatalogMediaSignature,
} from '../src/services/catalogMediaSign.service.js';
import { parseCatalogMediaRequest } from '../src/security/cee/secureMediaGrid.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

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
      maxBytes: COURSE_UPLOAD_MAX_BYTES,
    });
  } catch (error) {
    code = error?.code || null;
  }
  ok(`${label} → ${expectedCode}`, code === expectedCode);
}

function testWiring() {
  console.log('\nWiring checks');
  mustContain('src/services/courseImageUpload.service.js', [
    'validateSecureRasterImageUpload',
    'reencodeValidatedRasterImage',
    'COURSE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024',
    "entityType: 'course_image_upload'",
    'uploads/courses',
  ], 'course upload service');

  mustContain('src/controllers/courseImageUpload.controller.js', [
    'finalizeCourseImageUpload',
    'generateCourseTempUploadFilename',
    'UploadRejectedError',
    'normalizeUploadExtension',
  ], 'course upload controller');

  mustNotContain('src/controllers/courseImageUpload.controller.js', [
    'detectImageKindFromFile',
    'course-covers',
    '5 * 1024 * 1024',
  ], 'legacy course upload removed');

  mustContain('src/middleware/courseImageUploadRateLimit.js', [
    'courseImageUploadIpRateLimit',
    'courseImageUploadUserRateLimit',
    'admin.course.upload.rate_limit',
  ], 'course upload rate limits');

  mustContain('src/constants/secureMedia.constants.js', [
    "COURSE_UPLOAD_NAMESPACE = 'courses'",
    'COURSE_UPLOAD_FILENAME_PATTERN',
  ], 'secure media constants');

  mustContain('src/services/secureMedia.service.js', [
    'assertCourseUploadFilename',
    'COURSE_UPLOAD_NAMESPACE',
  ], 'secure media service');

  mustContain('src/security/cee/protectionGrid.js', [
    '/api\\/uploads\\/courses\\/',
    'catalogMediaGuard',
  ], 'protection grid');

  mustContain('src/security/cee/secureMediaGrid.js', [
    'catalogMediaGuard',
    'verifyCatalogMediaSignature',
    'assertEntitledCatalogThumbnail',
    'publicCatalogMedia',
  ], 'secure media grid');

  mustContain('src/services/catalogMediaSign.service.js', [
    'signCatalogMediaUrl',
    'verifyCatalogMediaSignature',
    'parseCatalogMediaUploadPath',
  ], 'catalog media signing');

  mustContain('src/config/env.js', ['PUBLIC_CATALOG_MEDIA', 'publicCatalogMedia'], 'catalog media env');

  const tempName = generateCourseTempUploadFilename();
  ok('temp upload filename ends with .upload', /\.upload$/i.test(tempName));
  ok('temp upload filename is hex-only prefix', /^[a-f0-9]{48}\.upload$/i.test(tempName));

  const sampleFinal = 'a'.repeat(48) + '.jpg';
  ok('course filename pattern accepts hardened name', COURSE_UPLOAD_FILENAME_PATTERN.test(sampleFinal));
  ok('course filename pattern rejects legacy name', !COURSE_UPLOAD_FILENAME_PATTERN.test('course-1-123.jpg'));

  const url = buildCourseImageUrl(sampleFinal);
  ok('course image URL uses courses namespace', url === `/api/uploads/${COURSE_UPLOAD_NAMESPACE}/${sampleFinal}`);
}

function testCatalogMediaSigning() {
  console.log('\nCatalog media signing');
  const sampleFinal = `${'a'.repeat(48)}.jpg`;
  const parsed = parseCatalogMediaUploadPath(`/api/uploads/courses/${sampleFinal}`);
  ok('parseCatalogMediaUploadPath accepts API path', parsed?.namespace === 'courses' && parsed.filename === sampleFinal);

  const { exp, sig } = signCatalogMediaPath('courses', sampleFinal, Math.floor(Date.now() / 1000) + 3600);
  ok('verifyCatalogMediaSignature accepts valid signature', verifyCatalogMediaSignature('courses', sampleFinal, exp, sig));
  const tampered =
    sig.slice(0, -1) + (sig.slice(-1).toLowerCase() === 'a' ? 'b' : 'a');
  ok('verifyCatalogMediaSignature rejects tampered signature', !verifyCatalogMediaSignature('courses', sampleFinal, exp, tampered));
  ok('verifyCatalogMediaSignature rejects expired signature', !verifyCatalogMediaSignature('courses', sampleFinal, Math.floor(Date.now() / 1000) - 10, sig));

  const signedUrl = signCatalogMediaUrl(`/api/uploads/courses/${sampleFinal}`);
  ok('signCatalogMediaUrl appends exp and sig', /[?&]exp=\d+/.test(signedUrl) && /[?&]sig=[a-f0-9]{64}/i.test(signedUrl));
  ok('signCatalogMediaUrl leaves external URLs unchanged', signCatalogMediaUrl('https://cdn.example.com/x.png') === 'https://cdn.example.com/x.png');

  const gridSample = `${'b'.repeat(48)}.jpg`;
  const preRouterReq = {
    params: {},
    path: `/api/uploads/courses/${gridSample}`,
    originalUrl: `/api/uploads/courses/${gridSample}`,
    query: {},
  };
  const preRouterParsed = parseCatalogMediaRequest(preRouterReq);
  ok(
    'parseCatalogMediaRequest resolves path before router params',
    preRouterParsed.namespace === 'courses' && preRouterParsed.filename === gridSample
  );
}

function testExtensionGuards() {
  console.log('\nExtension guards');
  const blocked = [
    ['photo.svg', 'blocked_extension'],
    ['page.html', 'blocked_extension'],
    ['script.js', 'blocked_extension'],
    ['shell.php', 'blocked_extension'],
    ['virus.exe', 'blocked_extension'],
  ];
  for (const [name, reason] of blocked) {
    const result = normalizeUploadExtension(name);
    ok(`blocks ${name}`, result.ok === false && result.reason === reason);
  }

  const doubleExt = normalizeUploadExtension('shell.php.jpg');
  ok('blocks double extension', doubleExt.ok === false && doubleExt.reason === 'double_extension');

  const traversal = normalizeUploadExtension('../../etc/passwd.jpg');
  ok('blocks path traversal in name', traversal.ok === false && traversal.reason === 'invalid_filename');

  const allowed = normalizeUploadExtension('photo.webp');
  ok('allows .webp extension', allowed.ok === true && allowed.ext === '.webp');
}

function testMaliciousPayloads() {
  console.log('\nMalicious payload rejection');
  const phpJpeg = writeFixture(
    'php-jpeg.bin',
    Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('<?php echo 1;')])
  );
  expectReject('polyglot JPEG+PHP', phpJpeg, 'photo.jpg', 'image/jpeg', 'POLYGLOT_REJECTED');

  const htmlPng = writeFixture(
    'html-png.bin',
    Buffer.concat([MINIMAL_PNG.subarray(0, 8), Buffer.from('<html><script>alert(1)</script>')])
  );
  expectReject('polyglot PNG+HTML', htmlPng, 'photo.png', 'image/png', 'POLYGLOT_REJECTED');

  const exeProbe = writeFixture('exe.bin', Buffer.from('MZ' + '\x00'.repeat(20)));
  expectReject('EXE signature', exeProbe, 'photo.jpg', 'image/jpeg', 'INVALID_SIGNATURE');

  const oversize = writeFixture('big.png', Buffer.concat([MINIMAL_PNG, Buffer.alloc(COURSE_UPLOAD_MAX_BYTES)]));
  expectReject('oversized file', oversize, 'photo.png', 'image/png', 'FILE_TOO_LARGE');

  const valid = writeFixture('valid.png', MINIMAL_PNG);
  let accepted = false;
  try {
    const result = validateSecureRasterImageUpload({
      filePath: valid,
      originalName: 'photo.png',
      claimedMime: 'image/png',
      size: MINIMAL_PNG.length,
      maxBytes: COURSE_UPLOAD_MAX_BYTES,
    });
    accepted = result.kind === 'png' && result.extension === '.png';
  } catch {
    accepted = false;
  }
  ok('accepts valid PNG', accepted);

  const jpegWithBinaryFalsePositive = writeFixture(
    'fp.jpg',
    Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
      Buffer.alloc(80, 0xab),
      Buffer.from('%PDF'),
      Buffer.from('PK\x03\x04'),
      Buffer.from('<html'),
      Buffer.from('<script'),
      Buffer.alloc(512, 0xcd),
      Buffer.from([0xff, 0xd9]),
    ])
  );
  let falsePositiveAccepted = false;
  try {
    validateSecureRasterImageUpload({
      filePath: jpegWithBinaryFalsePositive,
      originalName: 'photo.jpg',
      claimedMime: 'image/jpeg',
      size: Buffer.byteLength(readFileSync(jpegWithBinaryFalsePositive)),
      maxBytes: COURSE_UPLOAD_MAX_BYTES,
    });
    falsePositiveAccepted = true;
  } catch {
    falsePositiveAccepted = false;
  }
  ok('ignores marker-like bytes inside JPEG body', falsePositiveAccepted);
}

function main() {
  tempDir = mkdtempSync(path.join(tmpdir(), 'course-upload-sec-'));
  try {
    console.log('Course image upload security verification');
    testWiring();
    testCatalogMediaSigning();
    testExtensionGuards();
    testMaliciousPayloads();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
