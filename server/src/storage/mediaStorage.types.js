/**
 * Storage-agnostic media provider contract for question-bank images.
 *
 * Implementations: local filesystem (default), cloud providers (future).
 */

/** @typedef {'local'|'s3'|'gcs'|'azure'} MediaStorageProviderKind */

/**
 * @typedef {Object} StoredMediaObject
 * @property {string} url — Public app URL path (e.g. /api/uploads/question-bank/…)
 * @property {string} filename — Storage key / basename
 * @property {'jpeg'|'png'|'webp'} kind
 * @property {number} size — Stored byte length after re-encode
 */

/**
 * @typedef {Object} StoreMediaInput
 * @property {Buffer} buffer
 * @property {string} originalName
 * @property {string} [claimedMime]
 * @property {{ userId?: number|null, role?: string|null }} [actor]
 */

/**
 * @typedef {Object} QuestionBankMediaStorageProvider
 * @property {MediaStorageProviderKind} kind
 * @property {(filename: string) => Promise<Buffer|null>} readByFilename
 * @property {(input: StoreMediaInput) => Promise<StoredMediaObject>} storeRasterImage
 */

export const MEDIA_STORAGE_PROVIDER_ENV = 'MEDIA_STORAGE_PROVIDER';

export const DEFAULT_MEDIA_STORAGE_PROVIDER = 'local';
