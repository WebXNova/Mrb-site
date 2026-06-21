/**
 * Time-limited HMAC signatures for public catalog media (course thumbnails).
 */
import crypto from 'crypto';
import { env } from '../config/env.js';
import {
  CATALOG_MEDIA_NAMESPACES,
  COURSE_UPLOAD_NAMESPACE,
} from '../constants/secureMedia.constants.js';

function getSigningSecret() {
  return env.media.signingSecret || env.jwt.accessSecret || '';
}

/**
 * @param {string} namespace
 * @param {string} filename
 * @param {number} [expiresAtSec] Unix seconds
 */
export function signCatalogMediaPath(namespace, filename, expiresAtSec) {
  const ns = String(namespace || '').trim();
  const base = String(filename || '').trim();
  const exp =
    expiresAtSec ??
    Math.floor(Date.now() / 1000) + Math.max(60, Number(env.media.catalogSignedUrlTtlSeconds) || 86400);
  const payload = `${ns}/${base}:${exp}`;
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  return { exp, sig };
}

/**
 * @param {string} namespace
 * @param {string} filename
 * @param {unknown} exp
 * @param {unknown} sig
 */
export function verifyCatalogMediaSignature(namespace, filename, exp, sig) {
  const secret = getSigningSecret();
  if (!secret) return false;

  const expNum = Number(exp);
  const sigStr = String(sig || '').trim();
  if (!Number.isFinite(expNum) || expNum <= 0 || !/^[a-f0-9]{64}$/i.test(sigStr)) {
    return false;
  }
  if (expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${String(namespace).trim()}/${String(filename).trim()}:${expNum}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sigStr, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Parse `/api/uploads/{namespace}/{filename}` or storage-relative upload paths.
 * @param {unknown} raw
 * @returns {{ namespace: string, filename: string } | null}
 */
export function parseCatalogMediaUploadPath(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  const withoutQuery = trimmed.split('?')[0];
  const match = withoutQuery.match(
    /(?:\/api)?\/uploads\/(courses|course-covers)\/([a-f0-9]{48}\.(?:jpg|jpeg|png|webp))$/i
  );
  if (!match) return null;

  const namespace = match[1] === 'courses' ? COURSE_UPLOAD_NAMESPACE : match[1];
  if (!CATALOG_MEDIA_NAMESPACES.has(namespace)) return null;

  return { namespace, filename: match[2] };
}

/**
 * Append `exp` + `sig` query params to an internal catalog media URL.
 * External URLs and non-upload paths are returned unchanged.
 * @param {unknown} rawUrl
 */
export function signCatalogMediaUrl(rawUrl) {
  const parsed = parseCatalogMediaUploadPath(rawUrl);
  if (!parsed) return String(rawUrl ?? '').trim() || null;

  const { exp, sig } = signCatalogMediaPath(parsed.namespace, parsed.filename);
  const base = String(rawUrl).trim().split('?')[0];
  return `${base}?exp=${exp}&sig=${sig}`;
}
