/**
 * ZIP export/import media preservation tests.
 * Run: node src/utils/testExportZip.test.examples.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { buildTestExportJsonDocument } from './testExportJson.serializer.js';
import {
  collectTestExportMediaRefs,
  attachMediaBundleToExportDocument,
  rewriteImportPackageMediaUrls,
  sha256Hex,
} from './testExportMediaRefs.js';
import { createZipBuffer } from './testExportZip.serializer.js';
import { parseTestImportZip } from './testImportZip.parser.js';
import { validateTestImportFile } from '../services/testImportValidation.service.js';
import { TEST_EXPORT_ZIP_MANIFEST } from '../constants/testRichContent.constants.js';
import { QUESTION_BANK_UPLOAD_DIR } from '../storage/localQuestionBankStorage.provider.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const TEST_FILENAME = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp';
const TEST_UPLOAD_URL = `/api/uploads/question-bank/${TEST_FILENAME}`;

/** 1x1 webp (minimal valid raster) */
const MINI_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v/uAA==',
  'base64'
);

console.log('\n[collectTestExportMediaRefs]');
const baseDocument = buildTestExportJsonDocument({
  test_id: 1,
  course_id: 2,
  subject_ids: [1],
  test: {
    title: 'Media Test',
    description: null,
    category: 'MDCAT',
    test_type: 'mixed_subject',
    duration_minutes: 30,
    passing_marks: 10,
    max_attempts: 1,
    negative_marking: 0,
    shuffle_questions: false,
    shuffle_options: false,
    show_explanations: true,
    show_result_immediately: true,
    show_answers_after_submit: false,
    allow_retake: false,
    access_mode: 'private',
    tags: [],
  },
  questions: [
    {
      display_order: 0,
      marks_override: null,
      topic: 'Img',
      difficulty: 'easy',
      question_type: 'mcq',
      question_html: `<p>See <img src="${TEST_UPLOAD_URL}" alt="stem"></p>`,
      question_image_url: TEST_UPLOAD_URL,
      explanation_html: null,
      marks: 1,
      options: [
        {
          option_key: 'A',
          option_html: '<p>A</p>',
          image_url: null,
          is_correct: true,
          sort_order: 0,
        },
        {
          option_key: 'B',
          option_html: '<p>B</p>',
          image_url: null,
          is_correct: false,
          sort_order: 1,
        },
        {
          option_key: 'C',
          option_html: '<p>C</p>',
          image_url: null,
          is_correct: false,
          sort_order: 2,
        },
        {
          option_key: 'D',
          option_html: '<p>D</p>',
          image_url: null,
          is_correct: false,
          sort_order: 3,
        },
      ],
      correct_answer: 'A',
    },
  ],
});

const refs = collectTestExportMediaRefs(baseDocument);
assert(refs.size === 1, 'deduplicates column URL and inline img src');
const ref = [...refs.values()][0];
assert(ref.archivePath === `images/${TEST_FILENAME}`, 'maps upload URL to archive path');

console.log('\n[ZIP round-trip parse]');
await fs.mkdir(QUESTION_BANK_UPLOAD_DIR, { recursive: true });
const diskPath = path.join(QUESTION_BANK_UPLOAD_DIR, TEST_FILENAME);
try {
  await fs.writeFile(diskPath, MINI_WEBP, { flag: 'wx' });
} catch (error) {
  if (error?.code !== 'EEXIST') throw error;
}

const archivePath = `images/${TEST_FILENAME}`;
const bundledMedia = new Map([
  [
    archivePath,
    {
      originalUrl: TEST_UPLOAD_URL,
      archivePath,
      sha256: sha256Hex(MINI_WEBP),
      content_type: 'image/webp',
      buffer: MINI_WEBP,
    },
  ],
]);

const bundledDoc = attachMediaBundleToExportDocument(baseDocument, bundledMedia);
assert(bundledDoc.media_bundle === true, 'sets media_bundle flag');
assert(bundledDoc.questions[0].question_image_url === archivePath, 'rewrites column URL to archive path');
assert(bundledDoc.questions[0].question_html.includes(archivePath), 'rewrites inline img src');

const zipBuffer = await createZipBuffer([
  { path: TEST_EXPORT_ZIP_MANIFEST, buffer: Buffer.from(JSON.stringify(bundledDoc), 'utf8') },
  { path: archivePath, buffer: MINI_WEBP },
]);

const parsed = await parseTestImportZip(zipBuffer);
assert(parsed.ok === true, 'parseTestImportZip succeeds');
if (parsed.ok) {
  assert(parsed.imageFiles.size === 1, 'extracts one image file');
}

const base64Zip = zipBuffer.toString('base64');
const validation = await validateTestImportFile(base64Zip, 2, 'zip');
assert(validation.valid === true, 'ZIP passes full import validation');
assert(validation.format === 'zip', 'reports zip format');

console.log('\n[rewriteImportPackageMediaUrls]');
const remapped = rewriteImportPackageMediaUrls(bundledDoc, new Map([[archivePath, TEST_UPLOAD_URL]]));
assert(remapped.questions[0].question_image_url === TEST_UPLOAD_URL, 'rewrites archive path back to upload URL');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
