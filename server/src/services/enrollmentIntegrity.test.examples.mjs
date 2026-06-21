/**
 * H-01 enrollment integrity concurrency tests (in-memory simulator).
 *
 * Run: node src/services/enrollmentIntegrity.test.examples.mjs
 */

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

function eq(label, actual, expected) {
  ok(label, actual === expected);
}

function enrollmentKey(userId, courseId) {
  return `${userId}:${courseId}`;
}

/**
 * Mirrors getOrCreateEnrollmentInTransaction + UNIQUE(user_id, course_id).
 */
class EnrollmentIntegritySimulator {
  constructor() {
    /** @type {Map<string, Promise<void>>} */
    this._keyLocks = new Map();
    /** @type {Map<string, { id: number, userId: number, courseId: number, status: string }>} */
    this.byKey = new Map();
    /** @type {Map<number, { id: number, userId: number, courseId: number, status: string }>} */
    this.byId = new Map();
    this._nextId = 1;
  }

  /** @param {string} key */
  async _withKeyLock(key, fn) {
    const prev = this._keyLocks.get(key) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    this._keyLocks.set(key, prev.then(() => gate));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * @param {{ userId: number, courseId: number }} payload
   */
  async getOrCreateEnrollment(payload) {
    const key = enrollmentKey(payload.userId, payload.courseId);
    return this._withKeyLock(key, async () => {
      const existing = this.byKey.get(key);
      if (existing) {
        return { enrollment: existing, created: false };
      }

      try {
        const id = this._nextId++;
        const row = {
          id,
          userId: payload.userId,
          courseId: payload.courseId,
          status: 'pending',
        };
        if (this.byKey.has(key)) {
          return { enrollment: this.byKey.get(key), created: false };
        }
        this.byKey.set(key, row);
        this.byId.set(id, row);
        return { enrollment: row, created: true };
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
          const dup = this.byKey.get(key);
          if (!dup) throw error;
          return { enrollment: dup, created: false };
        }
        throw error;
      }
    });
  }

  countForUserCourse(userId, courseId) {
    return this.byKey.has(enrollmentKey(userId, courseId)) ? 1 : 0;
  }

  totalRows() {
    return this.byKey.size;
  }
}

function samplePayload(userId = 42, courseId = 7) {
  return { userId, courseId };
}

async function runConcurrent(sim, count, payload) {
  return Promise.all(
    Array.from({ length: count }, () => sim.getOrCreateEnrollment(payload))
  );
}

function assertSingleEnrollment(sim, results, userId, courseId, label) {
  eq(`${label}: exactly one row in store`, sim.totalRows(), 1);
  eq(`${label}: user+course key present once`, sim.countForUserCourse(userId, courseId), 1);
  const ids = new Set(results.map((r) => r.enrollment.id));
  eq(`${label}: all callers received same enrollment id`, ids.size, 1);
  const createdCount = results.filter((r) => r.created).length;
  ok(`${label}: at most one creator`, createdCount <= 1);
}

async function testDoubleClick() {
  console.log('\nDouble-click enrollment');
  const sim = new EnrollmentIntegritySimulator();
  const payload = samplePayload();
  const first = await sim.getOrCreateEnrollment(payload);
  const second = await sim.getOrCreateEnrollment(payload);
  ok('first request created row', first.created === true);
  ok('second request is idempotent', second.created === false);
  eq('same enrollment id returned', second.enrollment.id, first.enrollment.id);
  eq('store has one row', sim.totalRows(), 1);
}

async function testMultiTab() {
  console.log('\nMulti-tab parallel (2 requests)');
  const sim = new EnrollmentIntegritySimulator();
  const payload = samplePayload(10, 20);
  const [a, b] = await runConcurrent(sim, 2, payload);
  assertSingleEnrollment(sim, [a, b], 10, 20, 'multi-tab');
}

async function testConcurrent(count) {
  console.log(`\n${count} concurrent requests`);
  const sim = new EnrollmentIntegritySimulator();
  const payload = samplePayload(100, 200);
  const results = await runConcurrent(sim, count, payload);
  assertSingleEnrollment(sim, results, 100, 200, `${count}-way`);
}

async function testErDupEntryRecovery() {
  console.log('\nER_DUP_ENTRY recovery path');
  const sim = new EnrollmentIntegritySimulator();
  const key = enrollmentKey(5, 9);
  const row = { id: 99, userId: 5, courseId: 9, status: 'pending' };
  sim.byKey.set(key, row);
  sim.byId.set(99, row);

  const result = await sim.getOrCreateEnrollment({ userId: 5, courseId: 9 });
  ok('returns existing without create', result.created === false);
  eq('preserves canonical id', result.enrollment.id, 99);
  eq('no extra rows', sim.totalRows(), 1);
}

async function testDistinctCoursesAllowed() {
  console.log('\nDistinct courses for same user');
  const sim = new EnrollmentIntegritySimulator();
  const userId = 1;
  await sim.getOrCreateEnrollment({ userId, courseId: 1 });
  await sim.getOrCreateEnrollment({ userId, courseId: 2 });
  eq('two enrollments for two courses', sim.totalRows(), 2);
}

async function main() {
  console.log('Enrollment integrity concurrency tests');
  await testDoubleClick();
  await testMultiTab();
  await testConcurrent(10);
  await testConcurrent(50);
  await testConcurrent(100);
  await testErDupEntryRecovery();
  await testDistinctCoursesAllowed();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
