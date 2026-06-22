/**
 * Test for Testmoz CSV import with short-answer questions and student info skipping.
 * This verifies:
 * 1. Short-answer questions import successfully
 * 2. Student information questions are skipped
 * 3. Mixed short-answer, MCQ, and student-info questions are handled correctly
 *
 * Run: node tests/testmoz-short-answer-import.test.mjs
 */

import assert from 'node:assert/strict';
import { parseCsvRows, TestmozImportParser } from '../src/utils/testImportCsv.parser.js';

let passed = 0;
let failed = 0;

function assertCondition(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

// Test 1: Student information questions should be skipped
console.log('\nTest 1: Student information questions should be skipped');
{
  const csvText = `HTML
"<p>What is your Name?</p>",0,short,
"<p>What is your Father Name?</p>",0,short,
"<p>What is your District?</p>",0,short,
"<p>Explain photosynthesis?</p>",0,short,`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === true, 'CSV should parse successfully');
  assertCondition(result.package?.questions?.length === 1, 'Should have 1 question (others skipped as student info)');
}

// Test 2: Short-answer questions (non-student-info) should import successfully
console.log('\nTest 2: Short-answer academic questions should import successfully');
{
  const csvText = `HTML
"<p>Explain photosynthesis?</p>",0,short,
"<p>Define osmosis?</p>",0,short,`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === true, 'CSV should parse successfully');
  assertCondition(result.package?.questions?.length === 2, 'Should have 2 questions');
  
  if (result.package?.questions) {
    const q1 = result.package.questions[0];
    assertCondition(q1.question_type === 'short', 'Question 1 should be type "short"');
    assertCondition(q1.options.length === 0, 'Question 1 should have 0 options');
    
    const q2 = result.package.questions[1];
    assertCondition(q2.question_type === 'short', 'Question 2 should be type "short"');
    assertCondition(q2.options.length === 0, 'Question 2 should have 0 options');
  }
}

// Test 3: MCQ (one) questions should still require options and correct answer
console.log('\nTest 3: MCQ "one" questions should require 2+ options and correct answer');
{
  const csvText = `HTML
"<p>Which is correct?</p>",1,one,
*,Correct Answer
,Wrong Answer 1`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === true, 'CSV should parse successfully');
  assertCondition(result.package?.questions?.length === 1, 'Should have 1 question');
  
  if (result.package?.questions) {
    const q = result.package.questions[0];
    assertCondition(q.question_type === 'mcq', 'Question should be type "mcq"');
    assertCondition(q.options.length === 2, 'Question should have 2 options');
    assertCondition(q.options.some(o => o.is_correct), 'Question should have a correct answer');
  }
}

// Test 4: Mixed student-info, short-answer, and MCQ questions
console.log('\nTest 4: Mixed student-info, short-answer and MCQ questions');
{
  const csvText = `HTML
"<p>What is your Name?</p>",0,short,
"<p>Explain photosynthesis?</p>",0,short,
"<p>Which is correct?</p>",1,one,
*,Option A
,Option B
"<p>What is your Email?</p>",0,short,`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === true, 'CSV should parse successfully');
  assertCondition(result.package?.questions?.length === 2, 'Should have 2 questions (2 student-info skipped)');
  
  if (result.package?.questions) {
    const q1 = result.package.questions[0];
    assertCondition(q1.question_type === 'short', 'Question 1 should be type "short"');
    assertCondition(q1.options.length === 0, 'Question 1 should have 0 options');
    
    const q2 = result.package.questions[1];
    assertCondition(q2.question_type === 'mcq', 'Question 2 should be type "mcq"');
    assertCondition(q2.options.length === 2, 'Question 2 should have 2 options');
  }
}

// Test 5: MCQ without correct answer should fail
console.log('\nTest 5: MCQ without correct answer should fail');
{
  const csvText = `HTML
"<p>Which is correct?</p>",1,one,
,Option A
,Option B`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === false, 'CSV should fail to parse');
  assertCondition(result.code === 'TESTMOZ_CORRECT_ANSWER_MISSING', 'Error code should be TESTMOZ_CORRECT_ANSWER_MISSING');
}

// Test 6: MCQ with single option should fail
console.log('\nTest 6: MCQ with single option should fail');
{
  const csvText = `HTML
"<p>Which is correct?</p>",1,one,
*,Only Option`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === false, 'CSV should fail to parse');
  assertCondition(result.code === 'TESTMOZ_OPTION_COUNT', 'Error code should be TESTMOZ_OPTION_COUNT');
}

// Test 7: Multiple-choice questions should require 2+ options
console.log('\nTest 7: Multiple-choice questions should require 2+ options and correct answer');
{
  const csvText = `HTML
"<p>Select all that apply?</p>",2,multiple,
*,Correct Option 1
*,Correct Option 2
,Wrong Option`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === true, 'CSV should parse successfully');
  assertCondition(result.package?.questions?.length === 1, 'Should have 1 question');
  
  if (result.package?.questions) {
    const q = result.package.questions[0];
    assertCondition(q.question_type === 'mcq', 'Question should be type "mcq"');
    assertCondition(q.options.length === 3, 'Question should have 3 options');
    assertCondition(q.options.filter(o => o.is_correct).length === 2, 'Question should have 2 correct answers');
  }
}

// Test 8: Real-world scenario with student info and multiple question types
console.log('\nTest 8: Real-world Testmoz with student-info, short-answer, and MCQ questions');
{
  const csvText = `HTML
"<p>What is your Name?</p>",0,short,
"<p>What is your Father Name?</p>",0,short,
"<p>What is your District?</p>",0,short,
"<p>What is your Email?</p>",0,short,
"<p>Fresh Or Improver?</p>",0,short,
"<p>Which organelle is the powerhouse of the cell?</p>",1,one,
*,Mitochondria
,Nucleus
,Ribosome
,Chloroplast
"<p>Explain photosynthesis in short</p>",0,short,
"<p>Which elements are present in carbohydrates?</p>",1,one,
*,Carbon, Hydrogen, Oxygen
,Carbon, Nitrogen, Oxygen
,Carbon, Hydrogen, Nitrogen
,Hydrogen, Oxygen, Sulfur`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === true, 'CSV should parse successfully');
  assertCondition(result.package?.questions?.length === 3, 'Should have 3 questions (5 student-info skipped)');
  
  if (result.package?.questions) {
    const q1 = result.package.questions[0];
    assertCondition(q1.question_type === 'mcq', 'Question 1 should be type "mcq"');
    assertCondition(q1.options.length === 4, 'Question 1 should have 4 options');
    
    const q2 = result.package.questions[1];
    assertCondition(q2.question_type === 'short', 'Question 2 should be type "short"');
    assertCondition(q2.options.length === 0, 'Question 2 should have 0 options');
    
    const q3 = result.package.questions[2];
    assertCondition(q3.question_type === 'mcq', 'Question 3 should be type "mcq"');
    assertCondition(q3.options.length === 4, 'Question 3 should have 4 options');
  }
}

// Test 9: HTML-only introductory and instructional content should be ignored
console.log('\nTest 9: HTML-only introductory and instructional content should be ignored');
{
  const csvText = `HTML
"<p><strong><span style="font-size: 24px;">Oath of Integrity</span></strong></p>",,,
"<p>Welcome to this Test. Please read instructions carefully before starting.</p>",,,
"<p>Which organelle is the powerhouse of the cell?</p>",1,one,
*,Mitochondria
,Nucleus
,Ribosome
,Chloroplast`;

  const rows = parseCsvRows(csvText);
  const parser = new TestmozImportParser(rows);
  const result = parser.parse();

  assertCondition(result.ok === true, 'CSV should parse successfully');
  assertCondition(result.package?.questions?.length === 1, 'Should have exactly 1 question (intro/oath ignored)');
  if (result.package?.questions && result.package.questions.length > 0) {
    const q = result.package.questions[0];
    assertCondition(q.question_type === 'mcq', 'First imported question should be MCQ');
    assertCondition(q.options.length === 4, 'First imported question should have 4 options');
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n✗ ${failed} test(s) failed!`);
  process.exit(1);
}
