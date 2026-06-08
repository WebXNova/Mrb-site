/**
 * Unit test examples for studentAnswerSave (Phase 2C).
 *
 * Run: node src/services/studentAnswerSave.service.test.examples.mjs
 */
import { saveStudentAnswerBodySchema } from '../validators/studentAnswerSave.schema.js';

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

console.log('studentAnswerSave — unit test examples\n');

{
  const parsed = saveStudentAnswerBodySchema.safeParse({
    questionId: 15,
    selectedOptionId: 3,
  });
  assert(parsed.success, 'valid body parses');
}

{
  const parsed = saveStudentAnswerBodySchema.safeParse({
    questionId: '15',
    selectedOptionId: '3',
  });
  assert(parsed.success && parsed.data.questionId === 15, 'coerces numeric strings');
}

{
  const parsed = saveStudentAnswerBodySchema.safeParse({
    questionId: 15,
    selectedOptionId: 3,
    extra: true,
  });
  assert(!parsed.success, 'rejects unknown body keys');
}

{
  const parsed = saveStudentAnswerBodySchema.safeParse({ questionId: 0, selectedOptionId: 1 });
  assert(!parsed.success, 'rejects non-positive questionId');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
