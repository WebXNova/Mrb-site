/**
 * Pricing domain contract guards.
 *
 *  1) Foundation files exist with the expected markers (migration, DDL,
 *     service, DTO, validator, controller, admin route wiring, client API).
 *  2) Runtime code under `server/src` (excluding migrations, reference SQL
 *     and verify scripts themselves) does not reintroduce the legacy
 *     `courses.price` / `courses.original_price` columns or use
 *     `SELECT * FROM courses`.
 *  3) The validator enforces the "free implies amount 0" and "original >= price"
 *     domain rules at parse time.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { coursePricingWriteBodySchema } from '../src/validators/coursePricing.schema.js';
import { courseCreateBodySchema } from '../src/validators/courseWrite.schema.js';
import { toCoursePricingPublicDto } from '../src/dto/coursePricing.dto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const srcRoot = path.join(serverRoot, 'src');

const SKIP_RELATIVE_DIRS = new Set([
  path.join('src', 'db', 'migrations'),
  path.join('src', 'sql'),
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = path.relative(serverRoot, full);
      if ([...SKIP_RELATIVE_DIRS].some((s) => rel === s)) continue;
      out.push(...walk(full));
    } else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function mustContain(relPath, needles, label) {
  const full = path.join(serverRoot, relPath);
  try {
    statSync(full);
  } catch {
    throw new Error(`[verify-course-pricing-contract] missing file: ${relPath}`);
  }
  const text = readFileSync(full, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-course-pricing-contract] ${label}: expected "${n}" in ${relPath}`);
    }
  }
}

function assertSourcesAvoidLegacyCourseColumns() {
  const files = walk(srcRoot);
  const forbidden = [
    { re: /\bcourses\s*\.\s*price\b/, label: 'courses.price (legacy column read/write)' },
    { re: /\bcourses\s*\.\s*original_price\b/, label: 'courses.original_price (legacy column read/write)' },
    { re: /SELECT\s+\*\s+FROM\s+courses\b/i, label: 'SELECT * FROM courses (explicit projections required)' },
  ];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const { re, label } of forbidden) {
      if (re.test(text)) {
        throw new Error(`[verify-course-pricing-contract] forbidden ${label} in ${path.relative(serverRoot, file)}`);
      }
    }
  }
}

function assertValidatorEnforcesDomainRules() {
  const freeWithAmount = coursePricingWriteBodySchema.safeParse({
    pricing_type: 'free',
    price_amount: 100,
  });
  if (freeWithAmount.success) {
    throw new Error('[verify-course-pricing-contract] validator must reject free pricing with non-zero amount');
  }
  const originalBelowAmount = coursePricingWriteBodySchema.safeParse({
    pricing_type: 'one_time',
    price_amount: 1000,
    original_price_amount: 500,
  });
  if (originalBelowAmount.success) {
    throw new Error('[verify-course-pricing-contract] validator must reject original < price');
  }
  const originalEqualsAmount = coursePricingWriteBodySchema.safeParse({
    pricing_type: 'one_time',
    price_amount: 1000,
    original_price_amount: 1000,
  });
  if (originalEqualsAmount.success) {
    throw new Error('[verify-course-pricing-contract] validator must reject original equal to price');
  }
  const goodFree = coursePricingWriteBodySchema.safeParse({ pricing_type: 'free', price_amount: 0 });
  if (!goodFree.success) {
    throw new Error('[verify-course-pricing-contract] validator must accept valid free pricing');
  }
  const goodPaid = coursePricingWriteBodySchema.safeParse({
    pricing_type: 'one_time',
    price_amount: 2500,
    original_price_amount: 5000,
  });
  if (!goodPaid.success) {
    throw new Error('[verify-course-pricing-contract] validator must accept valid paid pricing');
  }
  const inverseWindow = coursePricingWriteBodySchema.safeParse({
    pricing_type: 'one_time',
    price_amount: 1000,
    starts_at: '2030-06-01T00:00:00.000Z',
    ends_at: '2030-05-01T00:00:00.000Z',
  });
  if (inverseWindow.success) {
    throw new Error('[verify-course-pricing-contract] validator must reject inverted starts/ends window');
  }
}

function assertCreateAcceptsAndValidatesNestedPricing() {
  const seed = [{ title: 'Unit A', description: null }];
  const noPricing = courseCreateBodySchema.safeParse({
    title: 'Course With No Pricing',
    description: 'Long enough description',
    level: 'beginner',
    subjects: seed,
  });
  if (!noPricing.success) {
    throw new Error('[verify-course-pricing-contract] create schema must accept missing pricing when subjects present');
  }
  const free = courseCreateBodySchema.safeParse({
    title: 'Course Free',
    description: 'Long enough description',
    level: 'beginner',
    subjects: seed,
    pricing: { pricing_type: 'free', price_amount: 0 },
  });
  if (!free.success) {
    throw new Error('[verify-course-pricing-contract] create schema must accept nested free pricing + subjects');
  }
  const badFree = courseCreateBodySchema.safeParse({
    title: 'Course Free Bad',
    description: 'Long enough description',
    level: 'beginner',
    subjects: seed,
    pricing: { pricing_type: 'free', price_amount: 1 },
  });
  if (badFree.success) {
    throw new Error('[verify-course-pricing-contract] create schema must reject nested free + non-zero amount');
  }
  const badOriginal = courseCreateBodySchema.safeParse({
    title: 'Course Bad Original',
    description: 'Long enough description',
    level: 'beginner',
    subjects: seed,
    pricing: { pricing_type: 'one_time', price_amount: 1000, original_price_amount: 500 },
  });
  if (badOriginal.success) {
    throw new Error('[verify-course-pricing-contract] create schema must reject nested original < current');
  }
  const noSubjects = courseCreateBodySchema.safeParse({
    title: 'No Rows',
    description: 'Long enough description',
    level: 'beginner',
  });
  if (noSubjects.success) {
    throw new Error('[verify-course-pricing-contract] create schema must require curriculum seeds on create');
  }
}

function assertDtoShape() {
  const dto = toCoursePricingPublicDto({
    pricing_type: 'one_time',
    price_amount: 2500,
    original_price_amount: 5000,
    currency_code: 'PKR',
  });
  const expected = ['type', 'currency', 'price_amount', 'original_price_amount'];
  const actual = Object.keys(dto).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected.slice().sort())) {
    throw new Error(`[verify-course-pricing-contract] pricing DTO keys mismatch: ${JSON.stringify(actual)}`);
  }
  if (dto.type !== 'one_time' || dto.currency !== 'PKR' || dto.price_amount !== 2500 || dto.original_price_amount !== 5000) {
    throw new Error('[verify-course-pricing-contract] pricing DTO values mismatch');
  }
  if (toCoursePricingPublicDto(null) !== null) {
    throw new Error('[verify-course-pricing-contract] pricing DTO must return null for empty row');
  }
}

try {
  mustContain(
    'src/db/migrations/004_course_pricing.sql',
    ['CREATE TABLE IF NOT EXISTS course_pricing', 'fk_course_pricing_course', 'idx_course_pricing_course_active'],
    'migration 004'
  );
  mustContain(
    'src/db/migrations/006_course_pricing_wizard.sql',
    ['subscription', 'enrollment_visible', 'public_purchase_visible'],
    'migration 006'
  );
  mustContain('src/validators/courseWizard.schema.js', ['courseWizardBodySchema'], 'wizard schema');
  mustContain('src/routes/admin.routes.js', ['postCourseWizard', '/courses/wizard'], 'wizard route');
  mustContain(
    'src/sql/schema.sql',
    ['CREATE TABLE IF NOT EXISTS course_pricing', 'fk_course_pricing_course'],
    'reference schema'
  );
  mustContain(
    'src/services/coursePricing.service.js',
    [
      'upsertActiveCoursePricing',
      'createDefaultFreeCoursePricing',
      'insertActiveCoursePricingWithConnection',
      'getEffectivePricingForCourse',
    ],
    'pricing service'
  );
  mustContain(
    'src/services/course.service.js',
    [
      'insertActiveCoursePricingWithConnection',
      'createDefaultFreeCoursePricing',
      'beginTransaction',
      'insertCurriculumSeedsForNewCourse',
    ],
    'course service create transactional flow'
  );
  mustContain(
    'src/services/courseCurriculumSeed.service.js',
    ['insertCurriculumSeedsForNewCourse', 'INSERT INTO subjects'],
    'curriculum seed helper'
  );
  mustContain(
    'src/controllers/courses.controller.js',
    ['courseCreateBodySchema', "pricing: p.pricing ?? null", 'curriculumSeeds: p.subjects'],
    'course controller wires the create-with-pricing schema'
  );
  mustContain(
    'src/validators/courseWrite.schema.js',
    ['courseCreateBodySchema', 'coursePricingWriteBodySchema', 'subjectSeedForCourseCreateSchema'],
    'course write schema exports create + reuses pricing + curriculum seed schema'
  );
  mustContain(
    'src/controllers/coursePricing.controller.js',
    ['putCoursePricing', 'admin.course_pricing.update'],
    'pricing controller'
  );
  mustContain(
    'src/routes/admin.routes.js',
    ["/courses/:courseId/pricing", 'putCoursePricing'],
    'admin routes'
  );
  mustContain(
    'src/services/courseCatalogQueries.service.js',
    ['LEFT JOIN course_pricing', 'cp_price_amount'],
    'catalog queries'
  );
  mustContain(
    'src/services/studentPortal.service.js',
    ['listActiveCourseRows'],
    'student portal'
  );

  assertSourcesAvoidLegacyCourseColumns();
  assertValidatorEnforcesDomainRules();
  assertCreateAcceptsAndValidatesNestedPricing();
  assertDtoShape();

  console.log('verify-course-pricing-contract: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
