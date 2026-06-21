/**
 * Scale and preservation tests for test export/import pipeline (no live DB).
 * Run: node tests/testTransferScale.test.examples.mjs
 */

import { performance } from 'node:perf_hooks';
import { buildScaleTestDocument, PRESERVATION_MARKERS } from './fixtures/testTransferFixtures.mjs';
import { validateTestImportWithDiagnostics } from '../src/services/testImportValidation.service.js';
import { serializeTestExportJsonBuffer } from '../src/utils/testExportJson.serializer.js';
import { parseImportJsonPayload } from '../src/services/testImportValidation.service.js';
import { collectTestExportMediaRefs } from '../src/utils/testExportMediaRefs.js';

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

/**
 * @param {number} count
 * @param {string} label
 */
async function runScaleCase(count, label) {
  console.log(`\n[scale: ${label} — ${count} questions]`);
  const doc = buildScaleTestDocument(count, { richHtml: true, withImages: true });
  assert(doc.questions.length === count, 'fixture question count');

  const t0 = performance.now();
  const validation = validateTestImportWithDiagnostics(doc, 1);
  const validateMs = Math.round(performance.now() - t0);

  assert(validation.valid === true, `validation passes (${validateMs}ms)`);
  assert(validation.preparedQuestions.length === count, 'prepared all questions');
  assert(validateMs < count * 50 + 5000, `validation responsive (${validateMs}ms)`);

  const t1 = performance.now();
  const buffer = serializeTestExportJsonBuffer(doc);
  const serializeMs = Math.round(performance.now() - t1);
  assert(buffer.length > 0, `JSON serializes (${serializeMs}ms)`);

  const parsed = parseImportJsonPayload(buffer.toString('utf8'));
  assert(parsed.ok === true, 'JSON round-trip parse');

  const refs = collectTestExportMediaRefs(doc);
  assert(refs.size >= 1, 'collects image references');
}

async function runPreservationCase() {
  console.log('\n[preservation: rich HTML + images]');
  const doc = buildScaleTestDocument(5, { richHtml: true, withImages: true });
  const validation = validateTestImportWithDiagnostics(doc, 1);
  assert(validation.valid === true, 'rich document validates');

  const prepared = validation.preparedQuestions[0]?.prepared;
  const html = prepared?.question_html ?? '';
  assert(html.includes(PRESERVATION_MARKERS.bold), 'preserves bold');
  assert(html.includes(PRESERVATION_MARKERS.list), 'preserves lists');
  assert(html.includes(PRESERVATION_MARKERS.table), 'preserves tables');
  assert(html.includes(PRESERVATION_MARKERS.superscript), 'preserves superscript');
  assert(html.includes(PRESERVATION_MARKERS.subscript), 'preserves subscript');

  const explanation = prepared?.explanation_html ?? '';
  assert(explanation.includes(PRESERVATION_MARKERS.explanation), 'preserves explanation formatting');

  assert(prepared?.question_image_url != null, 'preserves question image URL');
  assert(prepared?.options?.some((o) => o.image_url != null), 'preserves option image URL');
}

console.log('\n[test transfer scale suite]');
await runScaleCase(10, 'small');
await runScaleCase(100, 'medium');
await runScaleCase(1000, 'large');
await runPreservationCase();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
