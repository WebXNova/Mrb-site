/** Secure media namespace for Question Bank raster images. */
export const QUESTION_BANK_NAMESPACE = 'question-bank';

/** Secure media namespace for course catalog thumbnails (hardened uploads). */
export const COURSE_UPLOAD_NAMESPACE = 'courses';

/** Legacy alias namespace for course covers (same access policy as courses). */
export const COURSE_COVERS_NAMESPACE = 'course-covers';

/** Namespaces served as catalog thumbnails (signed URL or entitled token access). */
export const CATALOG_MEDIA_NAMESPACES = Object.freeze(
  new Set([COURSE_COVERS_NAMESPACE, COURSE_UPLOAD_NAMESPACE])
);

/**
 * Namespaces registered in secureMedia.service.js (filesystem directories under uploads/).
 * @type {ReadonlySet<string>}
 */
export const SECURE_MEDIA_NAMESPACES = Object.freeze(
  new Set([
    'student-qa',
    'teacher-qa',
    COURSE_COVERS_NAMESPACE,
    COURSE_UPLOAD_NAMESPACE,
    QUESTION_BANK_NAMESPACE,
  ])
);

/**
 * Hardened raster upload filenames: 48-char hex + raster extension (matches upload services).
 * @type {RegExp}
 */
export const RASTER_UPLOAD_FILENAME_PATTERN = /^[a-f0-9]{48}\.(jpg|png|webp)$/i;

/**
 * Question Bank upload filenames: 48-char hex + raster extension (matches upload service).
 * @type {RegExp}
 */
export const QUESTION_BANK_FILENAME_PATTERN = RASTER_UPLOAD_FILENAME_PATTERN;

/** Course thumbnail filenames under uploads/courses/. */
export const COURSE_UPLOAD_FILENAME_PATTERN = RASTER_UPLOAD_FILENAME_PATTERN;

/** @type {Readonly<Record<string, string>>} */
export const RASTER_UPLOAD_CONTENT_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
});

/** @type {Readonly<Record<string, string>>} */
export const QUESTION_BANK_CONTENT_TYPES = RASTER_UPLOAD_CONTENT_TYPES;

/** @type {Readonly<Record<string, string>>} */
export const COURSE_UPLOAD_CONTENT_TYPES = RASTER_UPLOAD_CONTENT_TYPES;
