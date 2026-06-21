/** Q&A secure media upload namespaces (student + teacher). */
export const QA_UPLOAD_NAMESPACES = Object.freeze(['student-qa', 'teacher-qa']);

/** URL prefix per namespace under /api/uploads/. */
export const QA_UPLOAD_URL_PREFIX = Object.freeze({
  'student-qa': '/api/uploads/student-qa/',
  'teacher-qa': '/api/uploads/teacher-qa/',
});

/**
 * DB columns that reference files in each namespace.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const QA_UPLOAD_REFERENCE_COLUMNS = Object.freeze({
  'student-qa': Object.freeze(['attachment_url', 'audio_url']),
  'teacher-qa': Object.freeze(['answer_attachment_url', 'answer_audio_url']),
});

export const QA_UPLOAD_QUARANTINE_ROOT = '_quarantine/qa';
