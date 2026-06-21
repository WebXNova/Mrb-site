/**
 * Scoped contract guard: legacy course catalog fields must not leak into contract files.
 * Uses targeted patterns (not naive word grep) to avoid false positives such as
 * `subject.service.js`, `metadata: {`, or nested `price_amount`.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const siteRoot = path.join(serverRoot, '..');

const SERVER_FILES = [
  'src/dto/course.dto.js',
  'src/services/course.service.js',
  'src/validators/courseWrite.schema.js',
  'src/controllers/coursesRead.controller.js',
  'src/services/courseCatalogQueries.service.js',
];

const CLIENT_FILES = [
  'src/api/catalogApi.js',
  'src/course/coursePresentation.js',
  'src/components/ui/CourseCard.jsx',
  'src/pages/CoursesPage.jsx',
  'src/pages/CourseDetailPage.jsx',
  'src/components/home/PopularCourses.jsx',
  'src/admin/pages/AdminCoursesPage.jsx',
];

/** @param {string} line */
function stripLineComment(line) {
  return line.replace(/\/\/.*$/, '').trim();
}

/**
 * Legacy course catalog fields that must not appear in contract-layer source.
 * Each test receives a single non-comment line.
 * @type {Array<{ label: string, test: (line: string) => boolean }>}
 */
const LINE_CHECKS = [
  {
    label: 'slug',
    test: (line) =>
      /\b(?:row|course)\.slug\b/.test(line) ||
      /['"]slug['"]\s*:/.test(line) ||
      /\bslug\s+VARCHAR/.test(line),
  },
  {
    label: 'accent_color',
    test: (line) => /\baccent_color\b|\baccentColor\b/.test(line),
  },
  {
    label: 'lectures_count',
    test: (line) => /\blectures_count\b/.test(line),
  },
  {
    label: 'students_enrolled',
    test: (line) => /\bstudents_enrolled\b/.test(line),
  },
  {
    label: 'rating',
    test: (line) => /\b(?:row|course)\.rating\b/.test(line) || /['"]rating['"]\s*:/.test(line),
  },
  {
    label: 'price',
    test: (line) => {
      if (/price_amount|original_price_amount|course_pricing|coursePricing/.test(line)) return false;
      return /\bcourses\s*\.\s*price\b/.test(line) || /\b(?:row|course)\.price\b/.test(line);
    },
  },
  {
    label: 'original_price',
    test: (line) => {
      if (/original_price_amount/.test(line)) return false;
      return /\bcourses\s*\.\s*original_price\b/.test(line) || /\b(?:row|course)\.original_price\b/.test(line);
    },
  },
  {
    label: 'courses.subject',
    test: (line) => {
      if (/subject\.service|\/subjects|listPublicSubjects|subjects\.controller|subjectSeed/.test(line)) {
        return false;
      }
      return (
        /\bcourses\s*\.\s*subject\b/.test(line) ||
        /\brow\.subject\b/.test(line) ||
        /\bsubject\s+VARCHAR\s*\(\s*80\s*\)/.test(line) ||
        /INSERT\s+INTO\s+courses\b[\s\S]*\bsubject\b/.test(line) ||
        /UPDATE\s+courses\b[\s\S]*\bsubject\b/.test(line) ||
        /['"]subject['"]\s*:/.test(line)
      );
    },
  },
];

function scanFile(relPath, rootDir) {
  const text = readFileSync(path.join(rootDir, relPath), 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = stripLineComment(lines[i]);
    if (!line) continue;
    for (const { label, test } of LINE_CHECKS) {
      if (test(line)) {
        throw new Error(
          `[verify-course-contract-grep] forbidden "${label}" in ${path.relative(siteRoot, path.join(rootDir, relPath))}:${i + 1}`
        );
      }
    }
  }
}

try {
  for (const rel of SERVER_FILES) scanFile(rel, serverRoot);
  for (const rel of CLIENT_FILES) scanFile(rel, path.join(siteRoot, 'client'));
  console.log('verify-course-contract-grep: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
