/**
 * Manual payment screenshot finalize contract (PNG/JPEG, multer mapping, rejections).
 * Run: node src/services/manualPaymentScreenshotUpload.test.examples.mjs
 */
import { existsSync } from 'fs';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import {
  finalizeManualPaymentScreenshot,
  mapMulterFileToScreenshotInput,
  resolveManualPaymentScreenshotOriginalName,
  MANUAL_PAYMENT_UPLOAD_MAX_BYTES,
  safeUnlink,
} from './manualPaymentScreenshotUpload.service.js';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let passed = 0;
let failed = 0;
const createdStored = [];

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

async function expectReject(label, fn, messageIncludes) {
  try {
    const result = await fn();
    if (result?.storedPath) createdStored.push(result.storedPath);
    failed += 1;
    console.error(`  ✗ ${label} — expected rejection`);
  } catch (error) {
    const match =
      error instanceof UploadRejectedError &&
      (!messageIncludes || String(error.message).includes(messageIncludes));
    if (match) {
      passed += 1;
      console.log(`  ✓ ${label}`);
      return;
    }
    failed += 1;
    console.error(`  ✗ ${label} — ${error?.constructor?.name}: ${error?.message}`);
  }
}

console.log('manual payment screenshot upload\n');

ok(
  'mobile blob without extension infers jpeg from MIME',
  resolveManualPaymentScreenshotOriginalName({ originalname: 'blob', mimetype: 'image/jpeg' }) ===
    'screenshot.jpg'
);
ok(
  'png originalname is preserved',
  resolveManualPaymentScreenshotOriginalName({ originalname: 'proof.PNG', mimetype: 'image/png' }) ===
    'proof.PNG'
);

const multerMapped = mapMulterFileToScreenshotInput({
  path: '/tmp/abc.upload',
  originalname: 'shot.png',
  mimetype: 'image/png',
  size: 1200,
});
ok('maps multer path → filePath', multerMapped.filePath === '/tmp/abc.upload');
ok('maps multer originalname → originalName', multerMapped.originalName === 'shot.png');
ok('maps multer mimetype → claimedMime', multerMapped.claimedMime === 'image/png');
ok('maps multer size', multerMapped.size === 1200);

try {
  mapMulterFileToScreenshotInput({ originalname: 'shot.png', mimetype: 'image/png', size: 10 });
  ok('multer file without path is rejected', false);
} catch (error) {
  ok(
    'multer file without path is rejected',
    error instanceof UploadRejectedError && error.message.includes('Screenshot upload failed')
  );
}

const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'mp-screenshot-'));

try {
  const pngPath = path.join(tmpRoot, 'shot.png');
  await writeFile(pngPath, PNG_1X1);
  const pngStored = await finalizeManualPaymentScreenshot({
    filePath: pngPath,
    originalName: 'shot.png',
    claimedMime: 'image/png',
    size: PNG_1X1.length,
  });
  createdStored.push(pngStored.storedPath);
  ok('PNG finalize returns storedPath', Boolean(pngStored.storedPath) && existsSync(pngStored.storedPath));
  ok('PNG url is namespaced', String(pngStored.url).startsWith('/api/uploads/manual-payments/'));
  ok('PNG sha256 is 64 hex chars', /^[a-f0-9]{64}$/.test(pngStored.sha256));
  ok('PNG kind is png', pngStored.kind === 'png');
  const pngMeta = await sharp(pngStored.storedPath).metadata();
  ok('stored PNG can be opened', pngMeta.format === 'png' && pngMeta.width > 0);

  const jpegBuf = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 40, b: 80 } },
  })
    .jpeg()
    .toBuffer();
  const jpegPath = path.join(tmpRoot, 'shot.jpg');
  await writeFile(jpegPath, jpegBuf);
  const jpegStored = await finalizeManualPaymentScreenshot(
    mapMulterFileToScreenshotInput({
      path: jpegPath,
      originalname: 'IMG_1001.JPG',
      mimetype: 'image/jpeg',
      size: jpegBuf.length,
    })
  );
  createdStored.push(jpegStored.storedPath);
  ok('JPEG via multer mapping stores file', existsSync(jpegStored.storedPath));
  ok('JPEG kind is jpeg', jpegStored.kind === 'jpeg');

  const rawMulterPath = path.join(tmpRoot, 'raw.png');
  await writeFile(rawMulterPath, PNG_1X1);
  await expectReject(
    'raw multer object (path not filePath) is rejected',
    () =>
      finalizeManualPaymentScreenshot({
        path: rawMulterPath,
        originalname: 'shot.png',
        mimetype: 'image/png',
        size: PNG_1X1.length,
      }),
    'Screenshot upload failed'
  );
  ok('raw-multer temp file still exists until caller cleanup', existsSync(rawMulterPath));

  const webpBuf = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 10, b: 10 } },
  })
    .webp()
    .toBuffer();
  const webpPath = path.join(tmpRoot, 'shot.webp');
  await writeFile(webpPath, webpBuf);
  await expectReject(
    'WEBP is rejected with JPG/PNG message',
    () =>
      finalizeManualPaymentScreenshot({
        filePath: webpPath,
        originalName: 'shot.webp',
        claimedMime: 'image/webp',
        size: webpBuf.length,
      }),
    'JPG or PNG'
  );

  const junkPath = path.join(tmpRoot, 'fake.png');
  await writeFile(junkPath, Buffer.from('not-an-image'));
  await expectReject(
    'invalid bytes rejected as unsupported image',
    () =>
      finalizeManualPaymentScreenshot({
        filePath: junkPath,
        originalName: 'fake.png',
        claimedMime: 'image/png',
        size: 12,
      }),
    'JPG or PNG'
  );

  const emptyPath = path.join(tmpRoot, 'empty.png');
  await writeFile(emptyPath, Buffer.alloc(0));
  await expectReject(
    'empty file rejected',
    () =>
      finalizeManualPaymentScreenshot({
        filePath: emptyPath,
        originalName: 'empty.png',
        claimedMime: 'image/png',
        size: 0,
      }),
    'empty'
  );

  const oversizedPath = path.join(tmpRoot, 'big.png');
  await writeFile(oversizedPath, PNG_1X1);
  await expectReject(
    'oversize claim rejected',
    () =>
      finalizeManualPaymentScreenshot({
        filePath: oversizedPath,
        originalName: 'big.png',
        claimedMime: 'image/png',
        size: MANUAL_PAYMENT_UPLOAD_MAX_BYTES + 1,
      }),
    '5 MB'
  );

  await expectReject(
    'missing filePath rejected without could-not-read wording',
    () =>
      finalizeManualPaymentScreenshot({
        originalName: 'shot.png',
        claimedMime: 'image/png',
        size: 100,
      }),
    'Screenshot upload failed'
  );
} finally {
  for (const storedPath of createdStored) {
    await safeUnlink(storedPath);
  }
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed) process.exit(1);
