/**
 * Aiken parser format compatibility tests.
 * Run: node src/services/aikenParser.formats.test.examples.mjs
 */
import {
  parseAiken,
  parseAikenDocument,
  OPTION_LINE_PATTERN,
  EXPLANATION_LINE_PATTERN,
} from './aikenParser.js';
import { partitionAikenDocumentForImport } from './aikenImportValidationPipeline.js';

const importContext = { course_id: 1, marks: 1, subject_id: null, topic: null, difficulty: null };

function buildQuestion({ stem = 'What is the capital of Pakistan?', optionStyle = 'paren', explanationStyle = 'EXPLANATION' }) {
  const optionPrefix = {
    paren: (key) => `${key})`,
    dot: (key) => `${key}.`,
    colon: (key) => `${key}:`,
    dash: (key) => `${key} -`,
  }[optionStyle];

  const lines = [stem];
  for (const key of ['A', 'B', 'C', 'D']) {
    const cities = { A: 'Karachi', B: 'Lahore', C: 'Islamabad', D: 'Peshawar' };
    lines.push(`${optionPrefix(key)} ${cities[key]}`);
  }
  lines.push('ANSWER: C');
  if (explanationStyle) {
    const expLine =
      explanationStyle === 'block'
        ? 'EXPLANATION:\nIslamabad is the capital city of Pakistan.'
        : `${explanationStyle}: Islamabad is the capital city of Pakistan.`;
    lines.push(expLine);
  }
  lines.push('');
  return lines.join('\n');
}

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

function runCase(name, fn) {
  console.log(`\n[${name}]`);
  try {
    fn();
  } catch (error) {
    failed += 1;
    console.error(`  ✗ threw: ${error.message}`);
  }
}

console.log('aikenParser format compatibility tests\n');

runCase('option pattern accepts A)', () => {
  assert(OPTION_LINE_PATTERN.test('A) Karachi'), 'A) matches');
  const match = 'B) Lahore'.match(OPTION_LINE_PATTERN);
  assert(match?.[1] === 'B' && match?.[2] === 'Lahore', 'captures key and text');
});

runCase('option pattern accepts A:', () => {
  assert(OPTION_LINE_PATTERN.test('A: Karachi'), 'A: matches');
});

runCase('option pattern accepts A.', () => {
  assert(OPTION_LINE_PATTERN.test('A. Karachi'), 'A. matches');
});

runCase('option pattern accepts A -', () => {
  assert(OPTION_LINE_PATTERN.test('A - Karachi'), 'A - matches');
});

runCase('option pattern is case insensitive', () => {
  assert(OPTION_LINE_PATTERN.test('a) karachi'), 'lowercase matches');
});

runCase('explanation pattern accepts EXPLANATION:', () => {
  assert(EXPLANATION_LINE_PATTERN.test('EXPLANATION: text'), 'EXPLANATION: matches');
});

runCase('explanation pattern accepts Explanation:', () => {
  assert(EXPLANATION_LINE_PATTERN.test('Explanation: text'), 'Explanation: matches');
});

runCase('explanation pattern accepts Exp:', () => {
  assert(EXPLANATION_LINE_PATTERN.test('Exp: text'), 'Exp: matches');
});

runCase('explanation pattern accepts EXP:', () => {
  assert(EXPLANATION_LINE_PATTERN.test('EXP: text'), 'EXP: matches');
});

for (const optionStyle of ['paren', 'dot', 'colon', 'dash']) {
  runCase(`parse succeeds with ${optionStyle} options`, () => {
    const content = buildQuestion({ optionStyle });
    const doc = parseAikenDocument(content);
    assert(doc.totalBlocks === 1, 'one block');
    assert(doc.questions.length === 1, 'one parsed question');
    assert(doc.parseErrors.length === 0, 'no parse errors');
    assert(doc.questions[0].correctAnswer === 'C', 'correct answer preserved');
  });
}

for (const explanationStyle of ['EXPLANATION', 'Explanation', 'Exp', 'EXP', 'block']) {
  runCase(`parse succeeds with ${explanationStyle} explanation`, () => {
    const content = buildQuestion({ explanationStyle });
    const doc = parseAikenDocument(content);
    assert(doc.questions.length === 1, 'parsed one question');
    assert(doc.questions[0].explanation?.includes('Islamabad'), 'explanation captured');
  });
}

runCase('QUESTION prefix stem is preserved', () => {
  const content = buildQuestion({ stem: 'QUESTION: What is the capital of Pakistan?' });
  const doc = parseAikenDocument(content);
  assert(
    doc.questions[0].question_text.includes('QUESTION:'),
    'QUESTION prefix kept in stem'
  );
});

runCase('resilient parse keeps valid questions when middle block invalid', () => {
  const good1 = buildQuestion({ stem: 'Question 1?' });
  const bad = `Broken?
A) One
B) Two
C) Three
D) Four

ANSWER: Z

`;
  const good2 = buildQuestion({ stem: 'Question 2?' });
  const doc = parseAikenDocument(`${good1}${bad}${good2}`);

  assert(doc.totalBlocks === 3, 'three blocks detected');
  assert(doc.questions.length === 2, 'two questions parsed');
  assert(doc.parseErrors.length === 1, 'one parse error');
  assert(doc.parseErrors[0].questionNumber === 2, 'middle block failed');
  assert(doc.parseErrors[0].code === 'INVALID_ANSWER', 'invalid answer reported');
  assert(doc.parseErrors[0].lineNumber > 0, 'line number present');

  const partitioned = partitionAikenDocumentForImport(doc, importContext);
  assert(partitioned.readyItems.length === 2, 'two ready items');
  assert(partitioned.errors.length === 1, 'one total error');
  assert(partitioned.errors[0].lineNumber > 0, 'diagnostic has lineNumber');
});

runCase('100 questions with 3 invalid yields 97 processed', () => {
  const blocks = [];
  for (let index = 1; index <= 100; index += 1) {
    if ([15, 42, 88].includes(index)) {
      blocks.push(`Bad Q${index}?
A) one
B) two
C) three
D) four

ANSWER: Z

`);
    } else {
      blocks.push(buildQuestion({ stem: `Question ${index}?` }));
    }
  }

  const doc = parseAikenDocument(blocks.join('\n'));
  assert(doc.totalBlocks === 100, '100 blocks');
  assert(doc.questions.length === 97, '97 parsed');
  assert(doc.parseErrors.length === 3, '3 parse errors');

  const partitioned = partitionAikenDocumentForImport(doc, importContext);
  assert(partitioned.readyItems.length === 97, '97 ready for import');
  assert(partitioned.errors.length === 3, '3 failures reported');
});

runCase('parseAiken backward compat returns successful questions only', () => {
  const good = buildQuestion({ stem: 'Good?' });
  const bad = `Bad?
A) one
B) two
C) three
D) four

ANSWER: Z

`;
  const parsed = parseAiken(`${good}${bad}${good}`);
  assert(parsed.length === 2, 'returns two successful questions');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
