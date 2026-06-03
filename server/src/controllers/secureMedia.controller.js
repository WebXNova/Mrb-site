import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { openEntitledMediaFile } from '../services/secureMedia.service.js';

export const getSecureUpload = asyncHandler(async (req, res) => {
  const namespace = String(req.params.namespace || '').trim();
  const filename = String(req.params.filename || '').trim();
  if (!namespace || !filename) {
    throw new ApiError(400, 'Invalid media path');
  }

  const userId = Number(req.user?.id ?? req.cee?.userId);
  const { stream, size, contentType } = await openEntitledMediaFile(userId, namespace, filename);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  stream.pipe(res);
});
