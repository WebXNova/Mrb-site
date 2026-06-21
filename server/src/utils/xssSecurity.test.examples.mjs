/**
 * LMS XSS security regression suite — CVE-2026-44990 and common stored-XSS vectors.
 *
 * Run: node src/utils/xssSecurity.test.examples.mjs
 */
import sanitizeHtml from 'sanitize-html';
import { sanitizeQuestionHtml } from './questionHtmlSanitizer.js';
import { sanitizeRichHtml } from './htmlSanitizer.js';
import { sanitizePlainText } from './plainTextSanitizer.js';
import { extractVisibleTextFromHtml } from './semanticHtmlContent.js';
import { createStripHtmlOptions, NON_TEXT_TAGS } from './sanitizeHtmlPolicy.js';
import { applyQuestionWriteSecurity } from '../security/questionContentSecurity.js';

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

/** Payloads that must never survive sanitization in any student-visible path. */
const MALICIOUS_PAYLOADS = [
  { name: 'script tag', input: '<p>Safe</p><script>alert(1)</script>' },
  { name: 'img onerror', input: '<img src=x onerror=alert(1)>' },
  { name: 'p onclick', input: '<p onclick="alert(1)">Click</p>' },
  { name: 'javascript href', input: '<a href="javascript:alert(1)">x</a>' },
  { name: 'iframe', input: '<iframe src="https://evil.test"></iframe>' },
  { name: 'svg onload', input: '<svg onload="alert(1)"></svg>' },
  { name: 'embed', input: '<embed src="evil.swf">' },
  { name: 'object', input: '<object data="evil"></object>' },
  { name: 'style expression', input: '<p style="background-image:url(javascript:alert(1))">x</p>' },
  {
    name: 'CVE-2026-44990 xmp passthrough',
    input: '<xmp><img src=x onerror=alert(1)></xmp>',
  },
  {
    name: 'xmp script smuggle',
    input: '<xmp><script>alert("xmp")</script></xmp>',
  },
  {
    name: 'nested xmp',
    input: '<div><xmp><b onmouseover=alert(1)>hover</b></xmp></div>',
  },
  {
    name: 'mathml handler',
    input: '<math><mi onclick="alert(1)">x</mi></math>',
  },
  {
    name: 'malformed unclosed script',
    input: '<p>Q</p><script>alert(1)',
  },
  {
    name: 'data uri img',
    input: '<img src="data:text/html,<script>alert(1)</script>">',
  },
  {
    name: 'vbscript href',
    input: '<a href="vbscript:msgbox(1)">x</a>',
  },
];

const DANGEROUS_PATTERNS = [
  /<script/i,
  /onerror\s*=/i,
  /onclick\s*=/i,
  /onload\s*=/i,
  /onmouseover\s*=/i,
  /javascript:/i,
  /vbscript:/i,
  /<iframe/i,
  /<svg/i,
  /<embed/i,
  /<object/i,
  /<xmp/i,
  /<math/i,
  /data:text\/html/i,
];

function assertNoDangerousPatterns(output, label) {
  for (const pattern of DANGEROUS_PATTERNS) {
    assert(!pattern.test(output), `${label}: must not match ${pattern}`);
  }
}

console.log('xssSecurity — comprehensive XSS regression\n');

console.log('Policy: nonTextTags includes xmp');
assert(NON_TEXT_TAGS.includes('xmp'), 'NON_TEXT_TAGS includes xmp');
assert(NON_TEXT_TAGS.includes('script'), 'NON_TEXT_TAGS includes script');

console.log('\nsanitizeQuestionHtml (rich content write + student API output)');
for (const { name, input } of MALICIOUS_PAYLOADS) {
  const out = sanitizeQuestionHtml(input);
  assertNoDangerousPatterns(out, `questionHtml/${name}`);
}

console.log('\nsanitizeRichHtml (student attempt load / results — unified policy)');
for (const { name, input } of MALICIOUS_PAYLOADS) {
  const out = sanitizeRichHtml(input);
  assertNoDangerousPatterns(out, `richHtml/${name}`);
}

console.log('\nsanitizePlainText (Q&A body plain-text fields)');
for (const { name, input } of MALICIOUS_PAYLOADS) {
  const out = sanitizePlainText(input);
  assertNoDangerousPatterns(out, `plainText/${name}`);
  assert(!/<[a-z]/i.test(out), `plainText/${name}: no HTML tags remain`);
}

console.log('\nextractVisibleTextFromHtml (semantic validation strip path)');
{
  const xmpPayload = '<xmp><img src=x onerror=alert(1)></xmp>';
  const visible = extractVisibleTextFromHtml(xmpPayload);
  assertNoDangerousPatterns(visible, 'semantic visible text');
}

console.log('\nRaw strip options (createStripHtmlOptions) — CVE-2026-44990 direct');
for (const { name, input } of MALICIOUS_PAYLOADS) {
  const out = sanitizeHtml(input, createStripHtmlOptions());
  assertNoDangerousPatterns(out, `stripOptions/${name}`);
}

console.log('\napplyQuestionWriteSecurity (end-to-end write path)');
{
  const secured = applyQuestionWriteSecurity({
    question_text: '<xmp><img src=x onerror=alert(1)></xmp><p>Valid stem</p>',
    explanation: '<xmp><script>alert(1)</script></xmp><p>Because</p>',
    options: [
      { option_text: '<xmp><b onmouseover=alert(1)>A</b></xmp><p>A</p>', is_correct: true },
      { option_text: 'B', is_correct: false },
      { option_text: 'C', is_correct: false },
      { option_text: 'D', is_correct: false },
    ],
  });
  assertNoDangerousPatterns(secured.question_text, 'writeSecurity question_text');
  assertNoDangerousPatterns(secured.explanation, 'writeSecurity explanation');
  for (let i = 0; i < secured.options.length; i += 1) {
    assertNoDangerousPatterns(secured.options[i].option_text, `writeSecurity option ${i}`);
  }
  assert(secured.question_text.includes('Valid stem'), 'legitimate stem preserved after xmp attack');
}

console.log('\nEducational content preservation');
{
  const tableHtml =
    '<figure class="table"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td style="text-align:center">Cell</td></tr></tbody></table></figure>';
  const out = sanitizeQuestionHtml(tableHtml);
  assert(out.includes('<table'), 'table preserved');
  assert(out.includes('text-align:center'), 'alignment style preserved');

  const subSup = '<p>Water: H<sub>2</sub>O and x<sup>2</sup></p>';
  const subOut = sanitizeQuestionHtml(subSup);
  assert(subOut.includes('<sub>2</sub>'), 'subscript preserved');
  assert(subOut.includes('<sup>2</sup>'), 'superscript preserved');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
