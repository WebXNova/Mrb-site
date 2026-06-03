/**
 * CEE Protected Instructional Table Registry (Phase 1)
 *
 * Single source of truth for which data stores require active enrollment
 * before any read/write. Used by:
 * - scopedQueryGuard (SQL course_id enforcement)
 * - future DB-level entitlement policies / query interceptors
 * - audit tooling and security reviews
 *
 * NOT role-based. NOT JWT-based. Enrollment `access_status = 'active'` is the gate.
 */

/** @typedef {'relational' | 'media'} CeeAssetKind */

/**
 * How a row is bound to the entitled course at query time.
 * @typedef {'direct_course_id' | 'via_foreign_key' | 'entitlement_context' | 'root_course'} CeeScopeStrategy
 */

/**
 * @typedef {object} CeeProtectedTableDefinition
 * @property {string} registryKey — stable CEE identifier (API/docs)
 * @property {string|null} tableName — physical MySQL table; null for non-tabular assets
 * @property {CeeAssetKind} assetKind
 * @property {CeeScopeStrategy} scopeStrategy
 * @property {string|null} scopeColumn — column on this table when strategy is direct_course_id
 * @property {string|null} parentRegistryKey — immediate parent in curriculum hierarchy
 * @property {string} rootRegistryKey — always 'courses' for instructional trees
 * @property {ReadonlyArray<string>} joinPath — SQL join chain to courses.id (for via_foreign_key)
 * @property {string} description — human-readable security note
 */

/**
 * Curriculum root — entitled course row (match enrollment.course_id to courses.id).
 * @type {CeeProtectedTableDefinition}
 */
const COURSES = Object.freeze({
  registryKey: 'courses',
  tableName: 'courses',
  assetKind: 'relational',
  scopeStrategy: 'root_course',
  scopeColumn: 'id',
  parentRegistryKey: null,
  rootRegistryKey: 'courses',
  joinPath: Object.freeze([]),
  description: 'Course catalog row; entitlement matches enrollment.course_id to courses.id.',
});

/** @type {CeeProtectedTableDefinition} */
const SUBJECTS = Object.freeze({
  registryKey: 'subjects',
  tableName: 'subjects',
  assetKind: 'relational',
  scopeStrategy: 'direct_course_id',
  scopeColumn: 'course_id',
  parentRegistryKey: 'courses',
  rootRegistryKey: 'courses',
  joinPath: Object.freeze(['subjects.course_id = ?']),
  description: 'Subject units; must filter WHERE subjects.course_id = entitled course.',
});

/** @type {CeeProtectedTableDefinition} */
const CHAPTERS = Object.freeze({
  registryKey: 'chapters',
  tableName: 'chapters',
  assetKind: 'relational',
  scopeStrategy: 'via_foreign_key',
  scopeColumn: null,
  parentRegistryKey: 'subjects',
  rootRegistryKey: 'courses',
  joinPath: Object.freeze([
    'chapters.subject_id = subjects.id',
    'subjects.course_id = ?',
  ]),
  description: 'Chapters; scope via subjects.course_id join — never list chapters globally.',
});

/** @type {CeeProtectedTableDefinition} */
const LECTURES = Object.freeze({
  registryKey: 'lectures',
  tableName: 'lectures',
  assetKind: 'relational',
  scopeStrategy: 'direct_course_id',
  scopeColumn: 'course_id',
  parentRegistryKey: 'chapters',
  rootRegistryKey: 'courses',
  joinPath: Object.freeze(['lectures.course_id = ?']),
  description: 'Video/content rows; require lectures.course_id = entitled course (and valid chapter hierarchy).',
});

/** @type {CeeProtectedTableDefinition} */
const TESTS = Object.freeze({
  registryKey: 'tests',
  tableName: 'tests',
  assetKind: 'relational',
  scopeStrategy: 'direct_course_id',
  scopeColumn: 'course_id',
  parentRegistryKey: 'courses',
  rootRegistryKey: 'courses',
  joinPath: Object.freeze(['tests.course_id = ?']),
  description: 'Assessments; orphan tests (course_id IS NULL) must never be student-accessible.',
});

/**
 * Registry key `questions` → physical table `test_questions`.
 * @type {CeeProtectedTableDefinition}
 */
const QUESTIONS = Object.freeze({
  registryKey: 'questions',
  tableName: 'test_questions',
  assetKind: 'relational',
  scopeStrategy: 'via_foreign_key',
  scopeColumn: null,
  parentRegistryKey: 'tests',
  rootRegistryKey: 'courses',
  joinPath: Object.freeze([
    'test_questions.test_id = tests.id',
    'tests.course_id = ?',
  ]),
  description: 'Test items; scope through tests.course_id — no global question reads.',
});

/** @type {CeeProtectedTableDefinition} */
const TEST_ATTEMPTS = Object.freeze({
  registryKey: 'test_attempts',
  tableName: 'test_attempts',
  assetKind: 'relational',
  scopeStrategy: 'via_foreign_key',
  scopeColumn: null,
  parentRegistryKey: 'tests',
  rootRegistryKey: 'courses',
  joinPath: Object.freeze([
    'test_attempts.test_id = tests.id',
    'tests.course_id = ?',
  ]),
  description: 'Student attempts; must join tests and match user_id + entitled tests.course_id.',
});

/**
 * Registry key `results` → physical table `test_results`.
 * @type {CeeProtectedTableDefinition}
 */
const RESULTS = Object.freeze({
  registryKey: 'results',
  tableName: 'test_results',
  assetKind: 'relational',
  scopeStrategy: 'via_foreign_key',
  scopeColumn: null,
  parentRegistryKey: 'test_attempts',
  rootRegistryKey: 'courses',
  joinPath: Object.freeze([
    'test_results.attempt_id = test_attempts.id',
    'test_attempts.test_id = tests.id',
    'tests.course_id = ?',
  ]),
  description: 'Graded outcomes; chain to attempts and tests — never expose cross-course results.',
});

/**
 * Instructional files (not a MySQL table). Enforced at HTTP/media layer + entitlement context.
 * @type {CeeProtectedTableDefinition}
 */
const UPLOADS = Object.freeze({
  registryKey: 'uploads',
  tableName: null,
  assetKind: 'media',
  scopeStrategy: 'entitlement_context',
  scopeColumn: null,
  parentRegistryKey: 'courses',
  rootRegistryKey: 'courses',
  joinPath: Object.freeze([]),
  description: 'Filesystem instructional assets under /api/uploads; no static serving — entitlement-gated controller only.',
});

/**
 * Immutable registry keyed by CEE registryKey.
 * Foundation for DB-level entitlement enforcement (Phase 1).
 *
 * @type {Readonly<Record<string, CeeProtectedTableDefinition>>}
 */
export const CEE_PROTECTED_TABLES = Object.freeze({
  courses: COURSES,
  subjects: SUBJECTS,
  chapters: CHAPTERS,
  lectures: LECTURES,
  tests: TESTS,
  questions: QUESTIONS,
  test_attempts: TEST_ATTEMPTS,
  results: RESULTS,
  uploads: UPLOADS,
});

/** Ordered keys for iteration / policy generation. */
export const CEE_PROTECTED_TABLE_KEYS = Object.freeze(Object.keys(CEE_PROTECTED_TABLES));

/**
 * Physical MySQL table names under protection (excludes media-only entries).
 * @type {ReadonlyArray<string>}
 */
export const CEE_PROTECTED_RELATIONAL_TABLE_NAMES = Object.freeze(
  CEE_PROTECTED_TABLE_KEYS.map((key) => CEE_PROTECTED_TABLES[key].tableName).filter(Boolean)
);

/**
 * @param {string} registryKeyOrTableName
 * @returns {boolean}
 */
export function isCeeProtectedTable(registryKeyOrTableName) {
  const key = String(registryKeyOrTableName || '').toLowerCase();
  if (key in CEE_PROTECTED_TABLES) return true;
  return CEE_PROTECTED_RELATIONAL_TABLE_NAMES.includes(key);
}

/**
 * @param {string} registryKey
 * @returns {CeeProtectedTableDefinition|null}
 */
export function getCeeProtectedTable(registryKey) {
  return CEE_PROTECTED_TABLES[registryKey] ?? null;
}

/**
 * SQL table hints for dev-time query guards (derived from registry — no duplicate list).
 * @type {ReadonlyArray<string>}
 */
export const CEE_PROTECTED_SQL_TABLE_HINTS = Object.freeze(
  [...new Set(CEE_PROTECTED_RELATIONAL_TABLE_NAMES)]
);

/**
 * Fail fast in non-production if registry invariants break (duplicate table names / keys).
 */
function assertRegistryIntegrity() {
  const keys = Object.keys(CEE_PROTECTED_TABLES);
  const keySet = new Set(keys);
  if (keySet.size !== keys.length) {
    throw new Error('[CEE] CEE_PROTECTED_TABLES contains duplicate registry keys');
  }

  const tableNames = CEE_PROTECTED_RELATIONAL_TABLE_NAMES;
  const tableSet = new Set(tableNames);
  if (tableSet.size !== tableNames.length) {
    throw new Error('[CEE] CEE_PROTECTED_TABLES maps multiple registry keys to the same tableName');
  }

  for (const key of keys) {
    const def = CEE_PROTECTED_TABLES[key];
    if (def.registryKey !== key) {
      throw new Error(`[CEE] Registry key mismatch: ${key} vs ${def.registryKey}`);
    }
  }
}

assertRegistryIntegrity();
