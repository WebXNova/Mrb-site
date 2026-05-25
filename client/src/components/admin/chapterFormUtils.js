/**
 * UX helpers for chapter create/edit forms. Backend remains authoritative (max lengths, uniqueness, hierarchy).
 */

/** Mirrors server title cap (chapter.controller titleSchema max). */
export const CHAPTER_TITLE_MAX_UX = 255;

/** Mirrors server DESCRIPTION_MAX_LENGTH. */
export const CHAPTER_DESCRIPTION_MAX_UX = 8000;

/**
 * Normalize display title for submit (collapse whitespace).
 * @param {unknown} raw
 */
export function normalizeChapterTitleUx(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Trim description edges only — preserve intentional newlines/spacing inside textarea.
 * @param {unknown} raw
 */
export function trimChapterDescriptionUx(raw) {
  const trimmed = String(raw ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * @param {unknown} value
 */
export function parseChapterOrderUx(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * PUT /admin/chapters/:id — ownership fields are immutable; strip anything else.
 * @param {Record<string, unknown>} raw
 */
export function buildChapterUpdatePayload(raw = {}) {
  /** @type {{ title?: string, description?: string | null, orderIndex?: number }} */
  const out = {};
  if (Object.prototype.hasOwnProperty.call(raw, 'title')) {
    out.title = raw.title;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'description')) {
    out.description = raw.description;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'orderIndex')) {
    out.orderIndex = raw.orderIndex;
  }
  return out;
}

/**
 * POST /admin/chapters — create-only hierarchy fields.
 * @param {Record<string, unknown>} raw
 */
export function buildChapterCreatePayload(raw = {}) {
  /** @type {{ subjectId?: number, title?: string, description?: string | null, orderIndex?: number, isActive?: boolean }} */
  const out = {};
  if (Object.prototype.hasOwnProperty.call(raw, 'subjectId')) {
    out.subjectId = raw.subjectId;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'title')) {
    out.title = raw.title;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'description')) {
    out.description = raw.description;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'orderIndex')) {
    out.orderIndex = raw.orderIndex;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'isActive')) {
    out.isActive = raw.isActive;
  }
  return out;
}

/**
 * Edit-mode UX validation — hierarchy is locked; only content fields are checked.
 * @param {{
 *   normalizedTitle: string,
 *   orderIndex: number | null,
 *   descriptionNormalized: string | null,
 * }} params
 */
export function validateChapterEditFormUx(params) {
  const title = params.normalizedTitle;
  if (!title) {
    return { message: 'Chapter title is required.' };
  }
  if (title.length > CHAPTER_TITLE_MAX_UX) {
    return { message: `Chapter title must be at most ${CHAPTER_TITLE_MAX_UX} characters.` };
  }
  if (params.orderIndex == null) {
    return { message: 'Order index must be a whole number of 0 or greater.' };
  }
  const desc = params.descriptionNormalized;
  if (desc != null && desc.length > CHAPTER_DESCRIPTION_MAX_UX) {
    return { message: `Description must be at most ${CHAPTER_DESCRIPTION_MAX_UX} characters.` };
  }
  return null;
}

/**
 * Client-side UX validation only — never substitutes for API validation.
 * @param {{
 *   courseId: unknown,
 *   subjectId: unknown,
 *   normalizedTitle: string,
 *   orderIndex: number | null,
 *   subjectsLoadedCount: number,
 *   subjectOptions?: Array<{ id?: unknown }>,
 *   descriptionNormalized: string | null,
 *   subjectsResolved?: boolean,
 *   subjectHierarchyLocked?: boolean,
 * }} params
 */
export function validateChapterFormUx(params) {
  const courseIdNum = Number(params.courseId);
  const subjectIdNum = Number(params.subjectId);

  const subjectLocked = params.subjectHierarchyLocked === true;

  if (!Number.isFinite(courseIdNum) || courseIdNum <= 0) {
    return { message: 'Select a course.' };
  }
  if (params.subjectsResolved === true && !subjectLocked && (params.subjectsLoadedCount ?? 0) === 0) {
    return { message: 'No subjects available for this course.' };
  }
  if (!Number.isFinite(subjectIdNum) || subjectIdNum <= 0) {
    return { message: 'Select a subject.' };
  }
  const title = params.normalizedTitle;
  if (!title) {
    return { message: 'Chapter title is required.' };
  }
  if (title.length > CHAPTER_TITLE_MAX_UX) {
    return { message: `Chapter title must be at most ${CHAPTER_TITLE_MAX_UX} characters.` };
  }
  if (params.orderIndex == null) {
    return { message: 'Order index must be a whole number of 0 or greater.' };
  }

  const desc = params.descriptionNormalized;
  if (desc != null && desc.length > CHAPTER_DESCRIPTION_MAX_UX) {
    return { message: `Description must be at most ${CHAPTER_DESCRIPTION_MAX_UX} characters.` };
  }

  /** Defensive: if options were loaded but selection is absent from list, subject may be archived/removed */
  const loadedCount = Number(params.subjectsLoadedCount ?? 0);
  if (
    !subjectLocked &&
    loadedCount > 0 &&
    !params.subjectOptions?.some((s) => String(s.id) === String(params.subjectId))
  ) {
    return { message: 'Selected subject is unavailable.' };
  }

  return null;
}

/**
 * Maps HTTP failures from chapter mutations to safe admin copy — never echoes SQL, stacks, or raw API bodies.
 * @param {unknown} err
 * @param {string} fallback
 * @param {{ context?: 'mutate' | 'fetchOne' | 'archive' }} [opts]
 */
export function safeChapterMutationError(err, fallback, opts = {}) {
  const context = opts.context ?? 'mutate';
  const status = err && typeof err === 'object' ? err.status : null;
  const msg = err && typeof err === 'object' && typeof err.message === 'string' ? err.message : '';

  if (status === 401 || status === 403) {
    return 'Your session expired or you do not have access. Please sign in again.';
  }
  if (status === 404) {
    if (context === 'fetchOne') return 'Chapter no longer exists.';
    /** Mutate/delete — chapter or parent hierarchy removed */
    if (context === 'archive') return 'Unable to archive chapter.';
    return 'Chapter no longer exists.';
  }
  if (status === 409) {
    if (context === 'archive') {
      return 'Unable to archive chapter.';
    }
    const lowered = msg.toLowerCase();
    /** Benign heuristic for duplicate titles; other 409s stay generic */
    if (lowered.includes('already exists') || lowered.includes('duplicate')) {
      return 'Chapter already exists.';
    }
    return 'Unable to save chapter.';
  }
  if (status === 422) {
    return 'Please check your input and try again.';
  }
  if (status === 400) {
    const lowered = msg.toLowerCase();
    if (lowered.includes('reassignment') || lowered.includes('reassign')) {
      return 'Chapter location cannot be changed. Only title, description, and order can be updated.';
    }
  }
  if (status === 429) {
    return 'Too many requests. Please wait and try again.';
  }
  if (status === 408 || status === 503) {
    return 'Unable to reach the server. Please try again.';
  }
  return fallback;
}
