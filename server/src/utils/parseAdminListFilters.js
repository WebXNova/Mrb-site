import { ApiError } from './apiError.js';

function parsePositiveInt(value) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseIsoDate(value, label) {
  if (value == null || String(value).trim() === '') return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ApiError(400, `Invalid ${label} (use YYYY-MM-DD)`, { code: 'INVALID_DATE_FILTER' });
  }
  return s;
}

function parseSearch(value) {
  return String(value ?? '')
    .trim()
    .slice(0, 160)
    .replace(/[%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStatus(value) {
  const normalized = String(value ?? 'all').trim().toLowerCase();
  if (!normalized || normalized === 'all') return 'all';
  if (normalized === 'active' || normalized === 'inactive') return normalized;
  if (normalized === 'published' || normalized === 'draft' || normalized === 'incomplete') {
    return normalized;
  }
  return 'all';
}

/**
 * Shared admin list filter query parser (course hierarchy, dates, search, status, pagination).
 *
 * @param {Record<string, unknown>} query
 * @param {{ defaultLimit?: number, maxLimit?: number }} [options]
 */
export function parseAdminListFilters(query = {}, options = {}) {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 200;
  const limit = Math.min(Math.max(Number(query.limit ?? defaultLimit), 1), maxLimit);
  const offsetRaw =
    query.offset != null && String(query.offset).trim() !== ''
      ? Number(query.offset)
      : query.page
        ? (Math.max(Number(query.page), 1) - 1) * limit
        : 0;
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

  return {
    courseId: parsePositiveInt(query.course_id ?? query.courseId),
    subjectId: parsePositiveInt(query.subject_id ?? query.subjectId),
    chapterId: parsePositiveInt(query.chapter_id ?? query.chapterId),
    lectureId: parsePositiveInt(query.lecture_id ?? query.lectureId ?? query.id),
    testId: parsePositiveInt(query.test_id ?? query.testId),
    dateFrom: parseIsoDate(query.dateFrom, 'dateFrom'),
    dateTo: parseIsoDate(query.dateTo, 'dateTo'),
    search: parseSearch(query.search),
    status: parseStatus(query.status),
    limit,
    offset,
  };
}

/**
 * Resolve course filter from hierarchy ids (subject/chapter imply course scope).
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ courseId?: number | null, subjectId?: number | null, chapterId?: number | null }} filters
 */
export async function resolveHierarchyCourseScope(pool, filters) {
  let courseId = filters.courseId ?? null;
  let subjectId = filters.subjectId ?? null;
  const chapterId = filters.chapterId ?? null;

  if (chapterId) {
    const [rows] = await pool.query(
      `SELECT ch.id, ch.subject_id, s.course_id
       FROM chapters ch
       INNER JOIN subjects s ON s.id = ch.subject_id
       WHERE ch.id = ?
       LIMIT 1`,
      [chapterId]
    );
    if (!rows[0]) {
      throw new ApiError(404, 'Chapter not found', { code: 'CHAPTER_NOT_FOUND' });
    }
    const chapterCourseId = Number(rows[0].course_id);
    const chapterSubjectId = Number(rows[0].subject_id);
    if (courseId != null && courseId !== chapterCourseId) {
      throw new ApiError(422, 'Chapter does not belong to the selected course', {
        code: 'HIERARCHY_MISMATCH',
      });
    }
    if (subjectId != null && subjectId !== chapterSubjectId) {
      throw new ApiError(422, 'Chapter does not belong to the selected subject', {
        code: 'HIERARCHY_MISMATCH',
      });
    }
    courseId = chapterCourseId;
    subjectId = chapterSubjectId;
  } else if (subjectId) {
    const [rows] = await pool.query(
      `SELECT id, course_id FROM subjects WHERE id = ? LIMIT 1`,
      [subjectId]
    );
    if (!rows[0]) {
      throw new ApiError(404, 'Subject not found', { code: 'SUBJECT_NOT_FOUND' });
    }
    const subjectCourseId = Number(rows[0].course_id);
    if (courseId != null && courseId !== subjectCourseId) {
      throw new ApiError(422, 'Subject does not belong to the selected course', {
        code: 'HIERARCHY_MISMATCH',
      });
    }
    courseId = subjectCourseId;
  }

  return { courseId, subjectId, chapterId };
}
