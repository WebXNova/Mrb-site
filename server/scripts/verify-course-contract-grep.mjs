/**
 * Scoped grep: forbidden course-domain strings must not appear in contract files.
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

const PATTERNS = [
  { re: /\bslug\b/, label: 'slug' },
  { re: /\baccent_color\b|\baccentColor\b/, label: 'accent_color' },
  { re: /\blectures_count\b/, label: 'lectures_count' },
  { re: /\bstudents_enrolled\b/, label: 'students_enrolled' },
  { re: /\brating\b/, label: 'rating' },
  { re: /\bprice\b/, label: 'price' },
  { re: /\boriginal_price\b|\boriginalPrice\b/, label: 'original_price' },
  { re: /\bsubject\b/, label: 'subject' },
];

try {
  for (const rel of SERVER_FILES) {
    const text = readFileSync(path.join(serverRoot, rel), 'utf8');
    for (const { re, label } of PATTERNS) {
      if (re.test(text)) {
        throw new Error(`[verify-course-contract-grep] forbidden "${label}" in server/${rel}`);
      }
    }
  }
  for (const rel of CLIENT_FILES) {
    const text = readFileSync(path.join(siteRoot, 'client', rel), 'utf8');
    for (const { re, label } of PATTERNS) {
      if (re.test(text)) {
        throw new Error(`[verify-course-contract-grep] forbidden "${label}" in client/${rel}`);
      }
    }
  }
  console.log('verify-course-contract-grep: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
