/**
 * Question Content security hardening verification.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeQuestionHtml } from '../src/utils/questionHtmlSanitizer.js';
import { validateQuestionImageUrl } from '../src/utils/questionImageUrlValidation.js';
import { applyQuestionWriteSecurity } from '../src/security/questionContentSecurity.js';
import {
  createQuestionBodySchema,
  updateQuestionBodySchema,
} from '../src/validators/questionWrite.schema.js';
import { standardMcqOptions } from './fixtures/standardMcqOptions.js';
import {
  MAX_RASTER_IMAGE_WIDTH,
  MAX_RASTER_IMAGE_HEIGHT,
} from '../src/utils/rasterImageReencode.js';
import { ApiError } from '../src/utils/apiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-content-security] ${message}`);
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(root, fileRel);
  assert(existsSync(filePath), `missing file: ${fileRel}`);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    assert(text.includes(needle), `${label}: expected "${needle}" in ${fileRel}`);
  }
}

function testXssBlocked() {
  const payloads = [
    '<p>Safe</p><script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<p onclick="alert(1)">Click</p>',
    '<a href="javascript:alert(1)">x</a>',
    '<iframe src="https://evil.test"></iframe>',
    '<svg onload="alert(1)"></svg>',
    '<p style="background-image:url(javascript:alert(1))">x</p>',
    '<embed src="evil.swf">',
    '<object data="evil"></object>',
  ];

  for (const payload of payloads) {
    const sanitized = sanitizeQuestionHtml(payload);
    assert(!/script/i.test(sanitized), `script must be removed from: ${payload}`);
    assert(!/onerror\s*=/i.test(sanitized), `onerror must be removed from: ${payload}`);
    assert(!/onclick\s*=/i.test(sanitized), `onclick must be removed from: ${payload}`);
    assert(!/javascript:/i.test(sanitized), `javascript: must be removed from: ${payload}`);
    assert(!/<iframe/i.test(sanitized), `iframe must be removed from: ${payload}`);
    assert(!/<svg/i.test(sanitized), `svg must be removed from: ${payload}`);
    assert(!/<embed/i.test(sanitized), `embed must be removed from: ${payload}`);
    assert(!/<object/i.test(sanitized), `object must be removed from: ${payload}`);
  }
}

function testEducationalContentSurvives() {
  const tableHtml =
    '<figure class="table"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td style="text-align:center">Cell</td></tr></tbody></table></figure>';
  const sanitizedTable = sanitizeQuestionHtml(tableHtml);
  assert(sanitizedTable.includes('<table'), 'table element must survive sanitization');
  assert(sanitizedTable.includes('<thead'), 'thead must survive sanitization');
  assert(sanitizedTable.includes('<tbody'), 'tbody must survive sanitization');
  assert(sanitizedTable.includes('<th'), 'th must survive sanitization');
  assert(sanitizedTable.includes('<td'), 'td must survive sanitization');
  assert(sanitizedTable.includes('text-align:center'), 'alignment style must survive sanitization');

  const subSup = '<p>Water: H<sub>2</sub>O and x<sup>2</sup> with <u>underline</u></p>';
  const sanitizedSubSup = sanitizeQuestionHtml(subSup);
  assert(sanitizedSubSup.includes('<sub>2</sub>'), 'subscript must survive sanitization');
  assert(sanitizedSubSup.includes('<sup>2</sup>'), 'superscript must survive sanitization');
  assert(sanitizedSubSup.includes('<u>underline</u>'), 'underline must survive sanitization');

  const lists = '<ol><li>One</li></ol><ul><li>Dot</li></ul>';
  const sanitizedLists = sanitizeQuestionHtml(lists);
  assert(sanitizedLists.includes('<ol>'), 'ordered list must survive sanitization');
  assert(sanitizedLists.includes('<ul>'), 'unordered list must survive sanitization');
}

function testMaliciousUrlsBlocked() {
  const blocked = [
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'blob:https://example.com/x',
    'file:///etc/passwd',
    'ftp://example.com/x.png',
    'vbscript:msgbox(1)',
    'https://example.com/<script>',
    '/api/uploads/question-bank/not-valid.jpg',
    'https://',
  ];

  for (const url of blocked) {
    const result = validateQuestionImageUrl(url);
    assert(!result.ok, `URL must be rejected: ${url}`);
  }

  const validInternal =
    '/api/uploads/question-bank/abcdef0123456789abcdef0123456789abcdef0123456789.jpg';
  const internal = validateQuestionImageUrl(validInternal);
  assert(internal.ok, 'valid internal upload path must be accepted');

  const validHttps = validateQuestionImageUrl('https://cdn.example.com/image.png');
  assert(validHttps.ok, 'valid https URL must be accepted');

  const tooLong = `https://example.com/${'a'.repeat(1100)}.png`;
  const longResult = validateQuestionImageUrl(tooLong);
  assert(!longResult.ok, 'overlong URL must be rejected');
}

function testWriteSecurityIntegration() {
  const secured = applyQuestionWriteSecurity({
    question_text: '<p>Prompt</p><script>alert(1)</script>',
    explanation: '<p>Because</p><iframe></iframe>',
    question_image_url: 'https://cdn.example.com/q.png',
    options: standardMcqOptions.map((opt) => ({ ...opt, image_url: null })),
  });
  assert(!secured.question_text.includes('script'), 'write security must strip script from question_text');
  assert(!secured.explanation.includes('iframe'), 'write security must strip iframe from explanation');
  assert(secured.question_image_url === 'https://cdn.example.com/q.png', 'valid question image URL preserved');

  let rejected = false;
  try {
    applyQuestionWriteSecurity({
      question_text: '<p>Valid</p>',
      explanation: null,
      options: [
        { option_text: 'A', is_correct: false },
        { option_text: 'B', is_correct: true, image_url: 'javascript:alert(1)' },
      ],
    });
  } catch (error) {
    rejected = error instanceof ApiError;
  }
  assert(rejected, 'malicious option image URL must be rejected');

  const schemaPayload = {
    course_id: 1,
    question_text: 'Sample?',
    marks: 1,
    question_image_url: 'data:image/png;base64,abc',
    options: standardMcqOptions,
  };
  const parsed = createQuestionBodySchema.safeParse(schemaPayload);
  assert(!parsed.success, 'schema must reject malicious question_image_url');
}

function testWiring() {
  mustContain(
    'src/services/questions.service.js',
    ['applyQuestionWriteSecurity', 'question_image_url', 'image_url'],
    'questions.service security wiring'
  );
  mustContain(
    'src/services/questionBankImageUpload.service.js',
    ['reencodeValidatedRasterImage', 'fs.writeFile'],
    'upload re-encode wiring'
  );
  mustContain(
    'src/middleware/questionBankImageUploadRateLimit.js',
    ['questionBankImageUploadUserRateLimit', 'question-bank-upload:user:'],
    'user upload rate limit'
  );
  mustContain(
    'src/routes/admin.routes.js',
    ['questionBankImageUploadIpRateLimit', 'questionBankImageUploadUserRateLimit'],
    'admin route rate limits'
  );
  mustContain('package.json', ['"sharp"'], 'sharp dependency');
}

function testDimensionPolicy() {
  assert(MAX_RASTER_IMAGE_WIDTH === 8000, 'max width must be 8000');
  assert(MAX_RASTER_IMAGE_HEIGHT === 8000, 'max height must be 8000');
}

function testUpdateSchemaStillValid() {
  const updatePayload = {
    course_id: 1,
    question_type: 'mcq',
    question_text: '<table><tr><td>x</td></tr></table>',
    marks: 2,
    options: [
      { option_key: 'A', option_text: 'A', is_correct: true },
      { option_key: 'B', option_text: 'B', is_correct: false },
      { option_key: 'C', option_text: 'C', is_correct: false },
      { option_key: 'D', option_text: 'D', is_correct: false },
    ],
  };
  const parsed = updateQuestionBodySchema.safeParse(updatePayload);
  assert(parsed.success, 'update schema must accept valid MCQ payload');
}

function main() {
  testXssBlocked();
  testEducationalContentSurvives();
  testMaliciousUrlsBlocked();
  testWriteSecurityIntegration();
  testWiring();
  testDimensionPolicy();
  testUpdateSchemaStillValid();
  console.log('[verify-question-content-security] all checks passed');
}

main();
