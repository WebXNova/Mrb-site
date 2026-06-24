/**
 * Test for END marker and image-only row handling (CRITICAL PRODUCTION FIX).
 * 
 * Issue: Question 81 parsed correctly, followed by END marker and image-only HTML.
 * These were incorrectly being added as options, causing TESTMOZ_OPTION_COUNT error.
 */

import { TestmozImportParser } from '../src/utils/testImportCsv.parser.js';

function testCase(name, csvRows, expectedQuestions, expectedSuccess, expectedError) {
  try {
    const parser = new TestmozImportParser(csvRows);
    const result = parser.parse();
    
    if (expectedSuccess && !result.ok) {
      console.error(`✗ ${name}`);
      console.error(`  Expected success but got error: ${result.code}`);
      console.error(`  Message: ${result.message}`);
      return false;
    }
    
    if (!expectedSuccess && result.ok) {
      console.error(`✗ ${name}`);
      console.error(`  Expected error ${expectedError} but parse succeeded`);
      return false;
    }
    
    if (!expectedSuccess && result.code !== expectedError) {
      console.error(`✗ ${name}`);
      console.error(`  Expected error ${expectedError} but got ${result.code}`);
      return false;
    }
    
    if (expectedSuccess && result.package.questions.length !== expectedQuestions) {
      console.error(`✗ ${name}`);
      console.error(`  Expected ${expectedQuestions} questions but got ${result.package.questions.length}`);
      return false;
    }
    
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  Unexpected error: ${error.message}`);
    return false;
  }
}

console.log('\n==================================================');
console.log('Test: END Marker and Image-Only Row Handling');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

// Test 1: Question followed by END marker (END should NOT be treated as option)
if (testCase(
  'Test 1: Question followed by END marker',
  [
    ['HTML'],
    ['<p>What is 2+2?</p>', '1', 'one', ''],
    ['*', 'Four'],
    ['', 'Five'],
    ['END'],  // This should flush the question, not create an option
  ],
  1,  // Should have 1 question
  true,  // Should succeed
)) {
  passed++;
} else {
  failed++;
}

// Test 2: Question with proper options followed by END (END should NOT be added as option)
if (testCase(
  'Test 2: MCQ with END marker (4 correct options already)',
  [
    ['HTML'],
    ['<p>Multiple choice?</p>', '1', 'one', ''],
    ['*', 'A'],
    ['', 'B'],
    ['', 'C'],
    ['', 'D'],
    ['END'],  // Should not be treated as 5th option
  ],
  1,  // Should have 1 question with 4 options
  true,  // Should succeed
)) {
  passed++;
} else {
  failed++;
}

// Test 3: Question followed by image-only HTML (should NOT be treated as option)
if (testCase(
  'Test 3: Question followed by image-only HTML row',
  [
    ['HTML'],
    ['<p>Visual question?</p>', '1', 'one', ''],
    ['*', 'Correct Answer'],
    ['', 'Wrong Answer'],
    ['<p><img class="fr-fic fr-fil fr-dib" src="image.jpg"/></p>'],  // Image-only, should be skipped
  ],
  1,  // Should have 1 question with 2 options
  true,  // Should succeed
)) {
  passed++;
} else {
  failed++;
}

// Test 4: Question followed by END then image-only HTML
if (testCase(
  'Test 4: Question, END marker, then image-only HTML',
  [
    ['HTML'],
    ['<p>Question here?</p>', '1', 'one', ''],
    ['*', 'Option A'],
    ['', 'Option B'],
    ['END'],  // Flush question
    ['<p><img src="after-end.jpg"/></p>'],  // Should be completely ignored
  ],
  1,  // Should have 1 question
  true,  // Should succeed
)) {
  passed++;
} else {
  failed++;
}

// Test 5: Multiple questions with END delimiters
if (testCase(
  'Test 5: Multiple questions separated by END markers',
  [
    ['HTML'],
    ['<p>Question 1?</p>', '1', 'one', ''],
    ['*', 'Answer 1'],
    ['', 'Wrong 1'],
    ['END'],
    ['<p>Question 2?</p>', '1', 'one', ''],
    ['*', 'Answer 2'],
    ['', 'Wrong 2'],
    ['END'],
  ],
  2,  // Should have 2 questions
  true,  // Should succeed
)) {
  passed++;
} else {
  failed++;
}

// Test 6: Image after END should not be treated as option
// This mimics the exact scenario from the bug report
if (testCase(
  'Test 6: Scenario from bug report (Q81 + END + image)',
  [
    ['HTML'],
    ['<p>Question 81</p>', '1', 'one', ''],
    ['*', 'A'],
    ['', 'B'],
    ['', 'C'],
    ['', 'D'],
    ['END'],  // Line 415 equivalent
    ['<p><img class="fr-fic fr-fil fr-dib" src="..."/></p>'],  // Line 416 equivalent
  ],
  1,  // Should have exactly 1 question with 4 options (not 5 with END, not 6 with image)
  true,  // Should succeed
)) {
  passed++;
} else {
  failed++;
}

// Test 7: Verify question 81 still imports correctly
if (testCase(
  'Test 7: Question 81 with all 4 MCQ options still works',
  [
    ['HTML'],
    ['<p>Question 81 content here</p>', '1', 'one', 'Question 81 explanation'],
    ['*', 'A (correct)'],
    ['', 'B'],
    ['', 'C'],
    ['', 'D'],
  ],
  1,  // Should have 1 question
  true,  // Should succeed
)) {
  passed++;
} else {
  failed++;
}

console.log('\n==================================================');
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

if (failed === 0) {
  console.log('✓ All END marker and image-only row tests passed!');
  process.exit(0);
} else {
  console.log('✗ Some tests failed');
  process.exit(1);
}
