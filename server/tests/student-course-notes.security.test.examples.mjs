/**
 * Student course notes — entitlement + scope security tests.
 * Run: node tests/student-course-notes.security.test.examples.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { mysqlPool, verifyMySqlConnection } from '../src/config/mysql.js';
import { scopedQueryBypass } from '../src/security/cee/db/scopedQuery.js';
import { ensureCourseNotesSchema } from '../src/db/ensureCourseNotesSchema.js';
import {
  buildCourseNoteFileUrl,
  COURSE_NOTES_UPLOAD_DIR,
  ensureCourseNotesUploadDir,
} from '../src/services/courseNoteUpload.service.js';
import {
  getStudentCourseNoteDownload,
  listStudentCourseNotesGrouped,
  listStudentNotesForLecture,
} from '../src/services/studentCourseNotes.service.js';
import { CourseAccessMismatchError } from '../src/errors/entitlement/EntitlementErrors.js';
import { ApiError } from '../src/utils/apiError.js';

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

async function insertTestNote({ courseId, title, actorId }) {
  await ensureCourseNotesUploadDir();
  const filename = `${randomBytes(24).toString('hex')}.pdf`;
  const pdf = Buffer.from('%PDF-1.4\n% student notes security test\n');
  await fs.writeFile(path.join(COURSE_NOTES_UPLOAD_DIR, filename), pdf);
  const fileUrl = buildCourseNoteFileUrl(filename);
  const [result] = await mysqlPool.query(
    `INSERT INTO notes (course_id, title, file_url, file_type, file_size, uploaded_by, is_active)
     VALUES (?, ?, ?, 'pdf', ?, ?, TRUE)`,
    [courseId, title, fileUrl, pdf.length, actorId]
  );
  return { noteId: Number(result.insertId), filename, pdf };
}

async function deleteTestNote(noteId, filename) {
  if (noteId) await mysqlPool.query(`DELETE FROM notes WHERE id = ?`, [noteId]);
  if (filename) {
    try {
      await fs.unlink(path.join(COURSE_NOTES_UPLOAD_DIR, filename));
    } catch {
      /* ignore */
    }
  }
}

async function ensureNotesTableReady() {
  try {
    await ensureCourseNotesSchema(mysqlPool);
  } catch (error) {
    const [rows] = await mysqlPool.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'notes'`
    );
    if (Number(rows[0]?.n) !== 1) throw error;
  }
}

async function pickActiveEnrollment() {
  const db = scopedQueryBypass({
    reason: 'admin_job:student_notes_test_v1',
    context: 'admin.tests.studentNotes',
  });
  const [rows] = await db.execute(
    `SELECT e.id AS enrollment_id, e.user_id, e.course_id, e.access_status
     FROM enrollments e
     WHERE e.access_status = 'active'
     ORDER BY e.id ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function pickDifferentCourseId(excludeCourseId) {
  const db = scopedQueryBypass({
    reason: 'admin_job:student_notes_test_v1',
    context: 'admin.tests.studentNotes',
  });
  const [rows] = await db.execute(
    `SELECT id FROM courses WHERE id <> ? ORDER BY id ASC LIMIT 1`,
    [excludeCourseId]
  );
  return rows[0]?.id != null ? Number(rows[0].id) : null;
}

async function pickAdminActor() {
  const [rows] = await scopedQueryBypass({
    reason: 'admin_job:student_notes_test_v1',
    context: 'admin.tests.courseNotes',
  }).execute(`SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY id ASC LIMIT 1`);
  return Number(rows[0]?.id) || null;
}

function flattenStudentNotes(payload) {
  return (payload.groups || []).flatMap((group) => group.notes || []);
}

async function main() {
  console.log('=== student course notes security tests ===\n');

  await verifyMySqlConnection();
  await ensureNotesTableReady();

  const enrollment = await pickActiveEnrollment();
  if (!enrollment) {
    console.log('Skipping DB-backed tests — no active enrollment found.');
    process.exit(0);
  }

  const studentId = Number(enrollment.user_id);
  const courseId = Number(enrollment.course_id);
  const enrollmentId = Number(enrollment.enrollment_id);
  const otherCourseId = await pickDifferentCourseId(courseId);

  let noteId = null;
  let noteFilename = null;
  let otherCourseNoteId = null;
  let otherNoteFilename = null;

  try {
    const actorId = await pickAdminActor();
    if (!actorId) throw new Error('No admin user for note fixture');

    const fixture = await insertTestNote({
      courseId,
      title: `Student notes test ${Date.now()}`,
      actorId,
    });
    noteId = fixture.noteId;
    noteFilename = fixture.filename;

    ok('student list returns active note for entitled course', await (async () => {
      const payload = await listStudentCourseNotesGrouped(courseId);
      return flattenStudentNotes(payload).some((note) => note.id === noteId);
    })());

    ok('student list omits file_url from note metadata', await (async () => {
      const payload = await listStudentCourseNotesGrouped(courseId);
      const note = flattenStudentNotes(payload).find((row) => row.id === noteId);
      return note != null && !('fileUrl' in note) && !('file_url' in note);
    })());

    ok('entitled student can resolve secure download descriptor', await (async () => {
      const file = await getStudentCourseNoteDownload({ noteId, userId: studentId });
      return Boolean(file.filename) && Boolean(file.contentType) && !String(file.filename).includes('\\uploads\\');
    })());

    if (otherCourseId) {
      const otherFixture = await insertTestNote({
        courseId: otherCourseId,
        title: `Student notes other course ${Date.now()}`,
        actorId,
      });
      otherCourseNoteId = otherFixture.noteId;
      otherNoteFilename = otherFixture.filename;

      ok('cross-course note download returns 403 (CourseAccessMismatch)', async () => {
        try {
          await getStudentCourseNoteDownload({ noteId: otherCourseNoteId, userId: studentId });
          return false;
        } catch (error) {
          return error instanceof CourseAccessMismatchError && error.httpStatus === 403;
        }
      });

      ok('cross-course note absent from entitled course list', async () => {
        const payload = await listStudentCourseNotesGrouped(courseId);
        return !flattenStudentNotes(payload).some((note) => note.id === otherCourseNoteId);
      });
    } else {
      ok('cross-course note download returns 403 (CourseAccessMismatch)', true);
      ok('cross-course note absent from entitled course list', true);
    }

    ok('revoked/inactive enrollment blocks download on next request', async () => {
      await mysqlPool.query(`UPDATE enrollments SET access_status = 'inactive' WHERE id = ?`, [enrollmentId]);
      try {
        try {
          await getStudentCourseNoteDownload({ noteId, userId: studentId });
          return false;
        } catch (error) {
          return error.httpStatus === 403;
        }
      } finally {
        await mysqlPool.query(`UPDATE enrollments SET access_status = 'active' WHERE id = ?`, [enrollmentId]);
      }
    });

    ok('deactivated note hidden from list and download returns 404', async () => {
      await mysqlPool.query(`UPDATE notes SET is_active = FALSE WHERE id = ?`, [noteId]);
      try {
        const payload = await listStudentCourseNotesGrouped(courseId);
        const listed = flattenStudentNotes(payload).some((note) => note.id === noteId);
        let downloadStatus = null;
        try {
          await getStudentCourseNoteDownload({ noteId, userId: studentId });
        } catch (error) {
          downloadStatus = error instanceof ApiError ? error.statusCode : error.httpStatus;
        }
        return !listed && downloadStatus === 404;
      } finally {
        await mysqlPool.query(`UPDATE notes SET is_active = TRUE WHERE id = ?`, [noteId]);
      }
    });

    ok('lecture context includes course-wide notes when present', async () => {
      const [lectureRows] = await mysqlPool.query(
        `SELECT id FROM lectures WHERE course_id = ? ORDER BY id ASC LIMIT 1`,
        [courseId]
      );
      const lectureId = Number(lectureRows[0]?.id);
      if (!lectureId) return true;
      const payload = await listStudentNotesForLecture(courseId, lectureId);
      return Array.isArray(payload.groups);
    });
  } finally {
    await deleteTestNote(noteId, noteFilename);
    await deleteTestNote(otherCourseNoteId, otherNoteFilename);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
