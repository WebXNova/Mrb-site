/**
 * Live DB checks for catalog visibility + mark-finished independence.
 * Run: node tests/course-controls.live.test.examples.mjs
 */
import assert from 'node:assert/strict';
import { mysqlPool } from '../src/config/mysql.js';
import { ensureCourseFinishedSchema } from '../src/db/ensureCourseFinishedSchema.js';
import { ensureCourseBatchScheduleNullableSchema } from '../src/db/ensureCourseBatchScheduleNullableSchema.js';
import { listActiveCourseRows } from '../src/services/courseCatalogQueries.service.js';
import { markCourseFinished } from '../src/services/courseMarkFinished.service.js';
import { updateCourse } from '../src/services/course.service.js';
import { ApiError } from '../src/utils/apiError.js';

const TAG = `ctrl_${Date.now()}`;

async function insertCourse({ title, isActive, status, admission }) {
  const [result] = await mysqlPool.query(
    `INSERT INTO courses (title, description, is_active, status, admission_status)
     VALUES (?, 'Live control test course description text.', ?, ?, ?)`,
    [title, isActive ? 1 : 0, status, admission]
  );
  return Number(result.insertId);
}

async function cleanup(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await mysqlPool.query(`DELETE FROM enrollments WHERE course_id IN (${placeholders})`, ids);
  await mysqlPool.query(`DELETE FROM course_batches WHERE course_id IN (${placeholders})`, ids);
  await mysqlPool.query(`DELETE FROM courses WHERE id IN (${placeholders})`, ids);
}

async function main() {
  await ensureCourseFinishedSchema(mysqlPool);
  await ensureCourseBatchScheduleNullableSchema(mysqlPool);

  const created = [];
  try {
    const closedId = await insertCourse({
      title: `${TAG}_closed`,
      isActive: true,
      status: 'published',
      admission: 'CLOSED',
    });
    const inactiveId = await insertCourse({
      title: `${TAG}_inactive`,
      isActive: false,
      status: 'published',
      admission: 'OPEN',
    });
    const openId = await insertCourse({
      title: `${TAG}_open`,
      isActive: true,
      status: 'published',
      admission: 'OPEN',
    });
    const finishId = await insertCourse({
      title: `${TAG}_finish`,
      isActive: true,
      status: 'published',
      admission: 'OPEN',
    });
    const otherId = await insertCourse({
      title: `${TAG}_other`,
      isActive: true,
      status: 'published',
      admission: 'OPEN',
    });
    created.push(closedId, inactiveId, openId, finishId, otherId);

    const catalog = await listActiveCourseRows();
    const ids = new Set(catalog.map((r) => Number(r.id)));
    assert.equal(ids.has(closedId), false, 'CLOSED course hidden from catalog');
    assert.equal(ids.has(inactiveId), false, 'inactive course hidden from catalog');
    assert.equal(ids.has(openId), true, 'OPEN + active published appears in catalog');
    console.log('PASS catalog listing filters');

    try {
      await markCourseFinished(finishId, { confirm: false, actor: { id: 1, role: 'admin' } });
      throw new Error('expected confirmation error');
    } catch (error) {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'CONFIRMATION_REQUIRED');
      console.log('PASS mark-finished requires confirm');
    }

    const [otherBefore] = await mysqlPool.query(
      `SELECT admission_status, is_active FROM courses WHERE id = ?`,
      [otherId]
    );

    const [geo] = await mysqlPool.query(
      `SELECT province_id, district_id, city_id FROM enrollments LIMIT 1`
    );
    const [students] = await mysqlPool.query(
      `SELECT id FROM users WHERE role = 'student' LIMIT 2`
    );

    let enrolledOnFinish = 0;
    if (geo[0] && students.length >= 1) {
      for (const student of students) {
        try {
          await mysqlPool.query(
            `INSERT INTO enrollments (
               user_id, course_id, applicant_full_name, father_name, gender,
               whatsapp_number, email, province_id, district_id, city_id,
               hssc_status, mdcat_attempt_type, status, access_status
             ) VALUES (?, ?, 'Test Student', 'Father', 'male', '+923001111111',
               ?, ?, ?, ?, '12th', 'Fresher', 'approved', 'active')`,
            [
              student.id,
              finishId,
              `live-${TAG}-${student.id}@example.com`,
              geo[0].province_id,
              geo[0].district_id,
              geo[0].city_id,
            ]
          );
          enrolledOnFinish += 1;
        } catch (error) {
          console.log('  skip enroll user', student.id, error.code || error.message);
        }
      }
    }

    const result = await markCourseFinished(finishId, {
      confirm: true,
      actor: { id: 1, role: 'admin' },
    });
    assert.equal(result.admission_status, 'CLOSED');
    assert.equal(result.is_active, true);
    assert.equal(result.is_finished, true);

    const [[finishedRow]] = await mysqlPool.query(
      `SELECT is_active, admission_status, finished_at FROM courses WHERE id = ?`,
      [finishId]
    );
    assert.equal(Boolean(Number(finishedRow.is_active)), true, 'is_active unchanged');
    assert.equal(finishedRow.admission_status, 'CLOSED');
    assert.ok(finishedRow.finished_at);

    const [stillActive] = await mysqlPool.query(
      `SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ? AND access_status = 'active'`,
      [finishId]
    );
    assert.equal(Number(stillActive[0].n), 0, 'all active enrollments revoked on finished course');

    const [[otherAfter]] = await mysqlPool.query(
      `SELECT admission_status, is_active FROM courses WHERE id = ?`,
      [otherId]
    );
    assert.equal(otherAfter.admission_status, otherBefore[0].admission_status);
    assert.equal(Boolean(Number(otherAfter.is_active)), Boolean(Number(otherBefore[0].is_active)));

    if (enrolledOnFinish > 0) {
      assert.equal(result.revoked_enrollment_count, enrolledOnFinish);
    }

    console.log('PASS mark-finished independence and revoke scope');

    const admissionToggle = await updateCourse(openId, { admission_status: 'CLOSED' });
    assert.equal(admissionToggle.admission_status, 'CLOSED');
    assert.equal(admissionToggle.title, `${TAG}_open`, 'admission-only update must not wipe title');
    const reopened = await updateCourse(openId, { admission_status: 'OPEN' });
    assert.equal(reopened.admission_status, 'OPEN');
    console.log('PASS admission Open→Closed→Open without wiping identity');
  } finally {
    await cleanup(created);
    await mysqlPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  mysqlPool.end().catch(() => {});
});
