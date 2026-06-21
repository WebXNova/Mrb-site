import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  isAllowedMediaNamespace,
  openEntitledMediaFile,
  openPublicMediaFile,
} from '../services/secureMedia.service.js';
import { isCatalogMediaNamespace } from '../security/cee/secureMediaGrid.js';

export const getSecureUpload = asyncHandler(async (req, res) => {
  const namespace = String(req.params.namespace || '').trim();
  const filename = String(req.params.filename || '').trim();
  if (!namespace || !filename) {
    throw new ApiError(400, 'Invalid media path');
  }
  if (!isAllowedMediaNamespace(namespace)) {
    throw new ApiError(400, 'Invalid media namespace');
  }

  if (isCatalogMediaNamespace(namespace)) {
    const { stream, size, contentType } = await openPublicMediaFile(namespace, filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(size));
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.catalogMediaAccess === 'signed') {
      const exp = Number(req.query?.exp);
      const nowSec = Math.floor(Date.now() / 1000);
      const maxAge = Number.isFinite(exp) ? Math.max(0, exp - nowSec) : 86400;
      res.setHeader('Cache-Control', `public, max-age=${maxAge}, immutable`);
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }

    stream.pipe(res);
    return;
  }

  const userId = Number(req.user?.id ?? req.cee?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const role = req.user?.role ?? null;
  const { stream, size, contentType } = await openEntitledMediaFile(userId, namespace, filename, { role });

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  stream.pipe(res);
});
