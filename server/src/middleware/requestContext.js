import crypto from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export function attachRequestContext(req, res, next) {
  const existing = String(req.get(REQUEST_ID_HEADER) || '').trim();
  const requestId = existing || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

