/**
 * Unit checks for answer storage schema (no DB).
 * Run: node src/answer/answer.service.test.examples.mjs
 */
import { saveAnswerBodySchema } from './answer.schema.js';

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

console.log('answerStorage — unit examples\n');

{
  const parsed = saveAnswerBodySchema.safeParse({
    question_id: 10,
    selected_option_id: 42,
  });
  ok('valid snake_case body parses', parsed.success === true);
}

{
  const parsed = saveAnswerBodySchema.safeParse({
    question_id: 10,
    selected_option_id: 42,
    extra: true,
  });
  ok('rejects unknown fields (strict)', parsed.success === false);
}

{
  const parsed = saveAnswerBodySchema.safeParse({
    questionId: 10,
    selectedOptionId: 42,
  });
  ok('rejects camelCase aliases', parsed.success === false);
}

{
  const parsed = saveAnswerBodySchema.safeParse({
    question_id: '15',
    selected_option_id: '3',
  });
  ok('coerces numeric strings', parsed.success && parsed.data.question_id === 15);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
