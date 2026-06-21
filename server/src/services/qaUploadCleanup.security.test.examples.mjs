/**
 * Q&A orphan upload cleanup — security acceptance tests.
 *
 * Run: npm run test:qa-upload-cleanup-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractUploadBasename,
  likeSuffixForFilename,
  loadReferencedUploadIndex,
  isUploadStillReferenced,
} from './qaUploadReferenceIndex.service.js';
import {
  recordQaUploadCleanupRun,
  resetQaUploadCleanupMetricsForTests,
  getQaUploadCleanupMetricsSnapshot,
} from '../observability/qaUploadCleanupMetrics.service.js';
import { getQaUploadCleanupConfig } from '../config/qaUploadCleanup.config.js';

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
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

console.log('qaUploadCleanupSecurity — acceptance tests\n');

ok('extractUploadBasename parses secure path', extractUploadBasename('/api/uploads/student-qa/9-abc.jpg') === '9-abc.jpg');
ok('extractUploadBasename rejects traversal', extractUploadBasename('/api/uploads/student-qa/../x.jpg') === null);
ok('likeSuffixForFilename shape', likeSuffixForFilename('9-abc.jpg') === '%/9-abc.jpg');

{
  const db = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT attachment_url')) {
        return [
          [
            {
              attachment_url: '/api/uploads/student-qa/1-img.jpg',
              audio_url: '/api/uploads/student-qa/1-rec-a.webm',
              answer_attachment_url: '/api/uploads/teacher-qa/2-img.jpg',
              answer_audio_url: null,
            },
          ],
          [],
        ];
      }
      if (normalized.includes('SELECT 1 AS ok FROM student_questions')) {
        return [[{ ok: 1 }], []];
      }
      return [[], []];
    },
  };
  const index = await loadReferencedUploadIndex(db);
  ok('reference index student-qa', index['student-qa'].has('1-img.jpg') && index['student-qa'].has('1-rec-a.webm'));
  ok('reference index teacher-qa', index['teacher-qa'].has('2-img.jpg'));

  const connection = {
    async query(sql, params) {
      if (String(sql).includes('SELECT 1 AS ok')) {
        ok('transactional recheck uses LIKE suffix', params?.[0] === '%/1-img.jpg');
        return [[{ ok: 1 }], []];
      }
      return [[], []];
    },
  };
  const referenced = await isUploadStillReferenced(connection, 'student-qa', '1-img.jpg');
  ok('transactional recheck detects reference', referenced === true);
}

{
  resetQaUploadCleanupMetricsForTests();
  recordQaUploadCleanupRun({
    durationMs: 42,
    candidates: 3,
    quarantined: 2,
    skippedReferenced: 1,
  });
  const snap = getQaUploadCleanupMetricsSnapshot();
  ok('metrics record runs', snap.runs_total === 1 && snap.candidates_total === 3);
}

{
  const config = getQaUploadCleanupConfig();
  ok('default mode is quarantine', config.mode === 'quarantine');
  ok('orphan TTL configured', config.orphanTtlHours >= 1);
}

mustContain(
  'src/services/qaUploadCleanup.service.js',
  [
    'isUploadStillReferenced',
    'loadReferencedUploadIndex',
    'Never delete/quarantine files referenced',
    'dryRun',
    'audit',
    'quarantine',
  ],
  'cleanup service safety'
);

mustContain(
  'src/jobs/qaUploadCleanupScheduler.js',
  ['startQaUploadCleanupScheduler', 'QA_UPLOAD_CLEANUP_SCHEDULE_ENABLED'],
  'scheduler'
);

mustContain(
  'src/controllers/metrics.controller.js',
  ['qaUploadCleanup', 'formatQaUploadCleanupMetricsPrometheus'],
  'metrics endpoint'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
