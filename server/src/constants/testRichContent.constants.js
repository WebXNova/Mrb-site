/** Test export engine constants. */

/** Canonical JSON export schema version (string semver). */
export const TEST_EXPORT_JSON_VERSION = '1.0';

/** Legacy numeric format version — kept for backward compatibility. */
export const RICH_CONTENT_FORMAT_VERSION = 1;

export const RICH_CONTENT_FORMAT = 'mrb_test_rich_v1';

export const TEST_EXPORT_FORMATS = Object.freeze({
  JSON: 'json',
  CSV: 'csv',
  ZIP: 'zip',
});

/** ZIP bundle layout */
export const TEST_EXPORT_ZIP_MANIFEST = 'test.json';
export const TEST_EXPORT_ZIP_IMAGES_PREFIX = 'images/';

/** Maximum questions per export (supports large assessments). */
export const MAX_TEST_EXPORT_QUESTIONS = 2000;

/** Maximum serialized import payload size (10 MB for JSON/CSV round-trip). */
export const MAX_IMPORT_PAYLOAD_BYTES = 10 * 1024 * 1024;

/** Maximum ZIP import archive size (includes bundled images). */
export const MAX_IMPORT_ZIP_BYTES = 100 * 1024 * 1024;

/** Maximum base64 string length for ZIP imports (~4/3 of MAX_IMPORT_ZIP_BYTES). */
export const MAX_IMPORT_ZIP_BASE64_LENGTH = Math.ceil(MAX_IMPORT_ZIP_BYTES * (4 / 3)) + 1024;

/** Maximum ZIP entries (manifest + images). */
export const MAX_IMPORT_ZIP_ENTRIES = MAX_TEST_EXPORT_QUESTIONS + 50;

/** Maximum total uncompressed ZIP bytes (zip-bomb guard). */
export const MAX_IMPORT_ZIP_UNCOMPRESSED_BYTES = 150 * 1024 * 1024;

/** Maximum single image file inside export ZIP / import bundle. */
export const ZIP_IMAGE_ENTRY_MAX_BYTES = 5 * 1024 * 1024;

/** Maximum JSON string length accepted for import (chars). */
export const MAX_IMPORT_JSON_STRING_LENGTH = 10_000_000;

export const TEST_IMPORT_SOURCE_TYPE = 'rich_json';

export const TEST_IMPORT_BATCH_STATUS = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

export const TEST_RICH_CONTENT_VALIDATION_LAYERS = Object.freeze({
  PAYLOAD_SIZE: 'payload_size',
  JSON_PARSE: 'json_parse',
  CSV_PARSE: 'csv_parse',
  SCHEMA_VERSION: 'schema_version',
  SCHEMA: 'schema',
  SECURITY: 'security',
  BUSINESS_RULES: 'business_rules',
  MCQ_INTEGRITY: 'mcq_integrity',
  DUPLICATE: 'duplicate_detection',
  MEDIA: 'media',
});

/** CSV export schema version embedded in header row. */
export const TEST_EXPORT_CSV_VERSION = '1.0';
