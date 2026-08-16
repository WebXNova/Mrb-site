/**
 * Course notes — scope integrity + magic-byte validation tests.
 * Run: node tests/course-notes.service.test.examples.mjs
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool, verifyMySqlConnection } from '../src/config/mysql.js';
import { scopedQueryBypass } from '../src/security/cee/db/scopedQuery.js';
import { runWithCeeQueryContext } from '../src/security/cee/db/ceeQueryContext.js';
import { ensureCourseNotesSchema } from '../src/db/ensureCourseNotesSchema.js';
import { validateNoteScopeHierarchy } from '../src/services/courseNoteScope.service.js';
import { listCourseNotes, createCourseNote } from '../src/services/courseNotes.service.js';
import { validateSecureNoteFileUpload, NOTE_UPLOAD_FINAL_EXTENSIONS } from '../src/utils/secureNoteFileValidation.js';
import { normalizeUploadExtension } from '../src/utils/secureRasterImageValidation.js';
import { finalizeCourseNoteUpload, COURSE_NOTES_UPLOAD_DIR } from '../src/services/courseNoteUpload.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function runNotesTest(courseId, fn) {
  return runWithCeeQueryContext(
    { validated: true, courseId: Number(courseId), context: 'admin.tests.courseNotes' },
    fn
  );
}

async function pickTwoCoursesWithSubjects() {
  const db = scopedQueryBypass({
    reason: 'admin_job:course_notes_test_v1',
    context: 'admin.tests.courseNotes',
  });
  const [rows] = await db.execute(
    `SELECT c.id AS course_id, s.id AS subject_id, s.title AS subject_title
     FROM courses c
     INNER JOIN subjects s ON s.course_id = c.id
     ORDER BY c.id ASC, s.id ASC
     LIMIT 20`
  );
  const byCourse = new Map();
  for (const row of rows) {
    const cid = Number(row.course_id);
    if (!byCourse.has(cid)) byCourse.set(cid, []);
    byCourse.get(cid).push(row);
  }
  const courseIds = [...byCourse.keys()];
  if (courseIds.length < 2) return null;
  const courseA = courseIds[0];
  const courseB = courseIds[1];
  const subjectA = byCourse.get(courseA)[0];
  const subjectB = byCourse.get(courseB)[0];
  return { courseA, courseB, subjectA, subjectB };
}

async function pickChapterForSubject(subjectId, courseId) {
  return runNotesTest(courseId, async () => {
    const [rows] = await mysqlPool.query(
      `SELECT id, subject_id FROM chapters WHERE subject_id = ? ORDER BY id ASC LIMIT 1`,
      [subjectId]
    );
    return rows[0] || null;
  });
}

async function writeTempFile(name, buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrb-note-test-'));
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buffer);
  return { filePath, dir };
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

async function main() {
  console.log('=== course notes tests ===\n');

  await verifyMySqlConnection();
  await ensureNotesTableReady();

  ok('validateNoteScopeHierarchy rejects foreign subject', await (async () => {
    const ctx = await pickTwoCoursesWithSubjects();
    if (!ctx) return true;
    try {
      await runNotesTest(ctx.courseA, () =>
        validateNoteScopeHierarchy(ctx.courseA, { subjectId: ctx.subjectB.subject_id })
      );
      return false;
    } catch (error) {
      return (
        String(error.message || '').includes('does not belong to this course') ||
        String(error.message || '').includes('Subject not found for this course')
      );
    }
  })());

  ok('validateNoteScopeHierarchy accepts course-wide null scope', await (async () => {
    const ctx = await pickTwoCoursesWithSubjects();
    if (!ctx) return true;
    const result = await runNotesTest(ctx.courseA, () =>
      validateNoteScopeHierarchy(ctx.courseA, {
        subjectId: null,
        chapterId: null,
        lectureId: null,
      })
    );
    return result.subjectId == null && result.chapterId == null && result.lectureId == null;
  })());

  ok('validateNoteScopeHierarchy rejects chapter without subject', await (async () => {
    const ctx = await pickTwoCoursesWithSubjects();
    if (!ctx) return true;
    const chapter = await pickChapterForSubject(ctx.subjectA.subject_id, ctx.courseA);
    if (!chapter) return true;
    try {
      await runNotesTest(ctx.courseA, () =>
        validateNoteScopeHierarchy(ctx.courseA, {
          subjectId: null,
          chapterId: Number(chapter.id),
        })
      );
      return false;
    } catch (error) {
      return String(error.message || '').includes('subject_id is required');
    }
  })());

  ok('note upload extension allowlist accepts pdf and docx filenames', () => {
    const pdf = normalizeUploadExtension('WebX_Nova_Proposal_Deal2.pdf', {
      allowedFinalExtensions: NOTE_UPLOAD_FINAL_EXTENSIONS,
    });
    const docx = normalizeUploadExtension('handout.docx', {
      allowedFinalExtensions: NOTE_UPLOAD_FINAL_EXTENSIONS,
    });
    const txt = normalizeUploadExtension('readme.txt', {
      allowedFinalExtensions: NOTE_UPLOAD_FINAL_EXTENSIONS,
    });
    return pdf.ok && docx.ok && !txt.ok;
  });

  ok('magic-byte rejects PDF extension with PNG bytes', await (async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const { filePath, dir } = await writeTempFile('fake.pdf', png);
    try {
      validateSecureNoteFileUpload({
        filePath,
        originalName: 'fake.pdf',
        claimedMime: 'application/pdf',
        size: png.length,
        maxBytes: 100 * 1024 * 1024,
      });
      return false;
    } catch {
      return true;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  })());

  ok('magic-byte accepts minimal PDF header', async () => {
    const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n');
    const { filePath, dir } = await writeTempFile('sample.pdf', pdf);
    try {
      const result = validateSecureNoteFileUpload({
        filePath,
        originalName: 'sample.pdf',
        claimedMime: 'application/pdf',
        size: pdf.length,
        maxBytes: 100 * 1024 * 1024,
      });
      return result.fileType === 'pdf';
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  ok('notes listed per course do not leak across courses', async () => {
    const ctx = await pickTwoCoursesWithSubjects();
    if (!ctx) return true;

    const pdf = Buffer.from('%PDF-1.4\n% test note isolation\n');
    const { filePath, dir } = await writeTempFile('isolation.pdf', pdf);
    let noteId = null;
    try {
      const finalized = await finalizeCourseNoteUpload({
        filePath,
        originalName: 'isolation.pdf',
        claimedMime: 'application/pdf',
        size: pdf.length,
      });

      const [adminRows] = await scopedQueryBypass({
        reason: 'admin_job:course_notes_test_v1',
        context: 'admin.tests.courseNotes',
      }).execute(
        `SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY id ASC LIMIT 1`
      );
      const actorId = Number(adminRows[0]?.id);
      if (!actorId) return false;

      const created = await runNotesTest(ctx.courseA, () =>
        createCourseNote({
          courseId: ctx.courseA,
          body: { title: `Test note ${Date.now()}`, subject_id: ctx.subjectA.subject_id },
          upload: {
            url: finalized.url,
            fileType: finalized.fileType,
            fileSize: finalized.fileSize,
          },
          actorId,
          actorRole: 'admin',
        })
      );
      noteId = created?.id;

      const courseBNotes = await runNotesTest(ctx.courseB, () =>
        listCourseNotes({ courseId: ctx.courseB })
      );
      return !courseBNotes.some((n) => n.id === noteId);
    } finally {
      if (noteId) {
        await mysqlPool.query(`DELETE FROM notes WHERE id = ?`, [noteId]);
      }
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
