/**
 * Secure media grid — catalog thumbnail access (signed URL or token-based entitlement).
 *
 * Course thumbnails remain available on the public catalog when PUBLIC_CATALOG_MEDIA=true,
 * but direct filesystem URLs are gated: anonymous access requires a valid signed URL;
 * enrolled students and staff may stream via authenticated session cookies.
 */
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../../config/mysql.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { MediaAccessDeniedError } from '../../errors/media/MediaErrors.js';
import { UnauthorizedError } from '../../errors/entitlement/EntitlementErrors.js';
import { isQuestionBankStaffRole } from '../../utils/isQuestionBankStaffRole.js';
import {
  readMultiRealmAccessToken,
  assertRealmBearerAllowedInProduction,
} from '../../services/authDecisionEngine.js';
import { verifyCatalogMediaSignature, parseCatalogMediaUploadPath } from '../../services/catalogMediaSign.service.js';
import {
  CATALOG_MEDIA_NAMESPACES,
  COURSE_COVERS_NAMESPACE,
  COURSE_UPLOAD_NAMESPACE,
} from '../../constants/secureMedia.constants.js';

export { CATALOG_MEDIA_NAMESPACES, COURSE_COVERS_NAMESPACE, COURSE_UPLOAD_NAMESPACE };

const ALLOWED_ROLES = new Set(['student', 'teacher', 'admin', 'super_admin']);

/**
 * @param {string} namespace
 */
export function isCatalogMediaNamespace(namespace) {
  return CATALOG_MEDIA_NAMESPACES.has(String(namespace || '').trim());
}

/**
 * Resolve namespace/filename from route params (post-router) or URL path (CEE grid runs pre-router).
 * @param {import('express').Request} req
 */
export function parseCatalogMediaRequest(req) {
  const exp = req.query?.exp;
  const sig = req.query?.sig;

  const namespaceParam = String(req.params?.namespace || '').trim();
  const filenameParam = String(req.params?.filename || '').trim();
  if (namespaceParam && filenameParam) {
    return { namespace: namespaceParam, filename: filenameParam, exp, sig };
  }

  const pathOrUrl = String(req.path || req.originalUrl || '').split('?')[0];
  const parsed = parseCatalogMediaUploadPath(pathOrUrl);
  if (parsed) {
    return { namespace: parsed.namespace, filename: parsed.filename, exp, sig };
  }

  // Mounted router strips /api/uploads prefix — req.path may be /courses/{file}
  const shortMatch = pathOrUrl.match(
    /^\/(courses|course-covers)\/([a-f0-9]{48}\.(?:jpg|jpeg|png|webp))$/i
  );
  if (shortMatch) {
    return { namespace: shortMatch[1], filename: shortMatch[2], exp, sig };
  }

  return { namespace: '', filename: '', exp, sig };
}

function verifyAccessJwt(token) {
  const secrets = [env.jwt.accessSecret, ...env.jwt.previousAccessSecrets];
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
      });
    } catch {
      // try next key
    }
  }
  throw new UnauthorizedError('Invalid or expired token.', { reason: 'invalid_session' });
}

/**
 * @param {number} userId
 * @param {string} namespace
 * @param {string} filename
 */
async function assertEntitledCatalogThumbnail(userId, namespace, filename) {
  const likeSuffix = `%/${filename}`;
  const [rows] = await mysqlPool.query(
    `SELECT c.id
     FROM courses c
     INNER JOIN enrollments e
       ON e.course_id = c.id
      AND e.user_id = ?
      AND e.access_status = 'active'
     WHERE c.image_url LIKE ? OR c.thumbnail_url LIKE ?
     LIMIT 1`,
    [userId, likeSuffix, likeSuffix]
  );
  if (!rows[0]) {
    throw new MediaAccessDeniedError('You do not have permission to access this file.', {
      namespace,
      filename,
      reason: 'not_entitled_for_course_thumbnail',
    });
  }
}

/**
 * @param {import('express').Request} req
 * @param {string} namespace
 * @param {string} filename
 * @returns {Promise<'staff'|'student'>}
 */
async function assertTokenCatalogAccess(req, namespace, filename) {
  const { token, source } = readMultiRealmAccessToken(req);
  if (!token) {
    throw new MediaAccessDeniedError('Signed URL or authentication required.', {
      namespace,
      filename,
      reason: 'missing_credentials',
    });
  }

  const payload = verifyAccessJwt(token);
  if (payload?.type && payload.type !== 'access') {
    throw new UnauthorizedError('Invalid token type.', { reason: 'invalid_token_type' });
  }
  if (!payload?.id || !payload?.sid) {
    throw new UnauthorizedError('Invalid token payload.', { reason: 'invalid_token_payload' });
  }

  const [rows] = await mysqlPool.query(
    `SELECT s.id, s.token_version_snapshot, u.token_version, u.role, u.status
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()
     LIMIT 1`,
    [payload.sid, payload.id]
  );
  const session = rows[0];
  if (!session) {
    throw new UnauthorizedError('Session expired. Please sign in again.', { reason: 'session_expired' });
  }

  const tokenVersion = Number(payload.tokenVersion);
  if (
    tokenVersion !== Number(session.token_version_snapshot) ||
    tokenVersion !== Number(session.token_version)
  ) {
    throw new UnauthorizedError('Session expired. Please sign in again.', { reason: 'token_version_mismatch' });
  }

  if (session.status !== 'active') {
    throw new ApiError(403, 'Account is suspended');
  }

  const role = String(session.role || payload.role || '');
  assertRealmBearerAllowedInProduction(req, source, role);
  if (!ALLOWED_ROLES.has(role)) {
    throw new ApiError(403, 'You do not have permission to access this file.');
  }

  req.user = { ...payload, role };

  if (isQuestionBankStaffRole(role)) {
    return 'staff';
  }

  await assertEntitledCatalogThumbnail(Number(payload.id), namespace, filename);
  return 'student';
}

/**
 * @param {import('express').Request} req
 * @returns {'signed'|'token'|null}
 */
export async function resolveCatalogMediaAccess(req) {
  const { namespace, filename, exp, sig } = parseCatalogMediaRequest(req);
  if (!isCatalogMediaNamespace(namespace) || !filename) {
    throw new MediaAccessDeniedError('Invalid catalog media path.', { namespace, filename });
  }

  if (verifyCatalogMediaSignature(namespace, filename, exp, sig)) {
    if (!env.media.publicCatalogMedia) {
      throw new MediaAccessDeniedError('Public catalog media is disabled.', {
        namespace,
        filename,
        reason: 'public_catalog_disabled',
      });
    }
    return 'signed';
  }

  if (!env.media.publicCatalogMedia) {
    const access = await assertTokenCatalogAccess(req, namespace, filename);
    return access === 'staff' || access === 'student' ? 'token' : null;
  }

  try {
    const access = await assertTokenCatalogAccess(req, namespace, filename);
    return access === 'staff' || access === 'student' ? 'token' : null;
  } catch (error) {
    if (error instanceof MediaAccessDeniedError && error.metadata?.reason === 'missing_credentials') {
      throw new MediaAccessDeniedError('Signed URL required for catalog media.', {
        namespace,
        filename,
        reason: 'signed_url_required',
      });
    }
    throw error;
  }
}

/**
 * CEE grid guard for GET /api/uploads/courses/* and /api/uploads/course-covers/*
 * @type {import('express').RequestHandler}
 */
export async function catalogMediaGuard(req, res, next) {
  try {
    const access = await resolveCatalogMediaAccess(req);
    req.catalogMediaAccess = access;
    return next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(error);
  }
}
