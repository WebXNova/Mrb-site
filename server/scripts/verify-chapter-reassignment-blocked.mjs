/**
 * Phase A — hierarchy integrity: chapter subject_id must never be mutable after creation.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  const p = path.join(root, rel);
  if (!existsSync(p)) throw new Error(`missing ${rel}`);
  return readFileSync(p, 'utf8');
}

try {
  const controller = read('src/controllers/chapter.controller.js');
  const service = read('src/services/chapter.service.js');

  if (controller.includes('subjectId: positiveIntSchema.optional()')) {
    throw new Error('chapter update schema must not allow subjectId');
  }
  if (!controller.includes('admin.chapter.reassignment_blocked')) {
    throw new Error('controller must audit admin.chapter.reassignment_blocked');
  }
  if (!controller.includes('CHAPTER_REASSIGNMENT_DISABLED')) {
    throw new Error('controller must return CHAPTER_REASSIGNMENT_DISABLED');
  }
  if (!controller.includes('assertChapterReassignmentNotRequested')) {
    throw new Error('controller must assertChapterReassignmentNotRequested before update parse');
  }

  if (!service.includes('CHAPTER_REASSIGNMENT_DISABLED')) {
    throw new Error('service updateChapter must throw CHAPTER_REASSIGNMENT_DISABLED for subjectId');
  }
  if (/SET subject_id\s*=/i.test(service)) {
    throw new Error('service must not SET subject_id on UPDATE chapters');
  }
  if (service.includes('nextSubjectId')) {
    throw new Error('service must not contain nextSubjectId reassignment logic');
  }

  const updateBlock = service.slice(service.indexOf('export async function updateChapter'));
  if (!updateBlock.includes('SET title = ?')) {
    throw new Error('updateChapter must update title/description/order_index only');
  }

  console.log('verify-chapter-reassignment-blocked: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
