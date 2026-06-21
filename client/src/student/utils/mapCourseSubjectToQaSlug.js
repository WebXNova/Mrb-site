/**
 * Normalize entitled course subjects for the question form.
 * All active subjects from the student's course are askable (subjectId is authoritative).
 * @param {Array<{ id: number, title: string }>} subjects
 * @returns {Array<{ id: number, title: string }>}
 */
export function mapCourseSubjectsForQuestionForm(subjects = []) {
  return (Array.isArray(subjects) ? subjects : [])
    .map((subject) => ({
      id: Number(subject.id),
      title: String(subject.title || '').trim(),
    }))
    .filter((subject) => subject.id > 0 && subject.title);
}

/** @deprecated Use mapCourseSubjectsForQuestionForm — kept for imports that map slugs. */
export { mapCourseSubjectTitleToQaSlug } from './mapCourseSubjectTitleToQaSlug.js';
