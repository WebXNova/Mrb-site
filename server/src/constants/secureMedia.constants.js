/** Secure media namespace for Question Bank raster images. */
export const QUESTION_BANK_NAMESPACE = 'question-bank';

/**
 * Namespaces registered in secureMedia.service.js (filesystem directories under uploads/).
 * @type {ReadonlySet<string>}
 */
export const SECURE_MEDIA_NAMESPACES = Object.freeze(
  new Set(['student-qa', 'course-covers', QUESTION_BANK_NAMESPACE])
);

/**
 * Question Bank upload filenames: 48-char hex + raster extension (matches upload service).
 * @type {RegExp}
 */
export const QUESTION_BANK_FILENAME_PATTERN = /^[a-f0-9]{48}\.(jpg|png|webp)$/i;

/** @type {Readonly<Record<string, string>>} */
export const QUESTION_BANK_CONTENT_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
});
