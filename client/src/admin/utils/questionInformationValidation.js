import {
  DEFAULT_QUESTION_MARKS,
  MAX_QUESTION_TOPIC_LENGTH,
  MIN_QUESTION_MARKS,
  PHASE_1_QUESTION_TYPE,
} from '../constants/questionBank.constants.js';

export function createDefaultQuestionInformationForm() {
  return {
    course_id: '',
    subject_id: '',
    topic: '',
    difficulty: '',
    marks: String(DEFAULT_QUESTION_MARKS),
    question_type: PHASE_1_QUESTION_TYPE,
  };
}

function parseMarksValue(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return NaN;
  return value;
}

/**
 * @param {ReturnType<typeof createDefaultQuestionInformationForm>} form
 * @param {{ subjectIds?: number[], isLoadingSubjects?: boolean, subjectsError?: string }} [options]
 */
export function validateQuestionInformation(form, options = {}) {
  const fieldErrors = {};
  const subjectIds = Array.isArray(options.subjectIds) ? options.subjectIds : [];
  const courseId = Number(form.course_id);

  if (!form.course_id || !Number.isInteger(courseId) || courseId <= 0) {
    fieldErrors.course_id = 'Course is required.';
  }

  const subjectId = Number(form.subject_id);
  if (!form.subject_id || !Number.isInteger(subjectId) || subjectId <= 0) {
    fieldErrors.subject_id = 'Subject is required.';
  } else if (
    Number.isInteger(courseId) &&
    courseId > 0 &&
    !options.isLoadingSubjects &&
    !options.subjectsError &&
    subjectIds.length > 0 &&
    !subjectIds.includes(subjectId)
  ) {
    fieldErrors.subject_id = 'Select a subject that belongs to the chosen course.';
  }

  const topic = String(form.topic ?? '').trim();
  if (topic.length > MAX_QUESTION_TOPIC_LENGTH) {
    fieldErrors.topic = `Topic must not exceed ${MAX_QUESTION_TOPIC_LENGTH} characters.`;
  }

  const marksValue = parseMarksValue(form.marks);
  if (form.marks === '' || form.marks === undefined || form.marks === null || String(form.marks).trim() === '') {
    fieldErrors.marks = 'Marks is required.';
  } else if (marksValue === null) {
    fieldErrors.marks = 'Marks is required.';
  } else if (!Number.isFinite(marksValue)) {
    fieldErrors.marks = 'Marks must be a valid number.';
  } else if (marksValue <= 0) {
    fieldErrors.marks = 'Marks must be greater than zero.';
  } else if (marksValue < MIN_QUESTION_MARKS) {
    fieldErrors.marks = `Marks must be at least ${MIN_QUESTION_MARKS}.`;
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

/**
 * @param {ReturnType<typeof createDefaultQuestionInformationForm>} form
 * @param {Parameters<typeof validateQuestionInformation>[1]} [options]
 */
export function isQuestionInformationReady(form, options = {}) {
  return validateQuestionInformation(form, options).valid;
}

/**
 * Normalized payload shape for future save API integration.
 * @param {ReturnType<typeof createDefaultQuestionInformationForm>} form
 */
export function toQuestionInformationPayload(form) {
  const marksValue = parseMarksValue(form.marks);
  const topic = String(form.topic ?? '').trim();

  return {
    course_id: Number(form.course_id),
    subject_id: Number(form.subject_id),
    topic: topic === '' ? null : topic,
    difficulty: String(form.difficulty ?? '').trim() === '' ? null : String(form.difficulty).trim(),
    marks: Number.isFinite(marksValue) ? marksValue : null,
    question_type: form.question_type || PHASE_1_QUESTION_TYPE,
  };
}
