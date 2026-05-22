import { checkIdempotency, storeIdempotencyResponse } from '../services/idempotency.service.js';
import { sendError } from '../utils/httpEnvelope.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Idempotency middleware for POST/PUT/PATCH endpoints
 * 
 * Checks for 'Idempotency-Key' header and handles replay detection.
 * If a replay is detected, returns the cached response instead of processing again.
 * After successful processing, stores the response for future replay protection.
 * 
 * Usage:
 *   router.post('/api/courses', idempotencyMiddleware, controller)
 */
export function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.get('Idempotency-Key') || req.get('idempotency-key');
  
  // Skip if no idempotency key provided (optional header)
  if (!idempotencyKey) {
    return next();
  }

  const endpoint = req.path;
  const method = req.method;
  const payload = req.body || {};

  // Check for existing idempotency record
  checkIdempotency(idempotencyKey, payload, endpoint, method)
    .then((result) => {
      if (result.replay) {
        // Return cached response
        return res.status(result.statusCode).json(result.response);
      }

      // Store original res.json for interception
      const originalJson = res.json.bind(res);
      
      // Intercept response to store it
      res.json = function (body) {
        const statusCode = res.statusCode || 200;
        
        // Only cache successful responses (2xx)
        if (statusCode >= 200 && statusCode < 300) {
          storeIdempotencyResponse(
            idempotencyKey,
            payload,
            statusCode,
            body,
            endpoint,
            method,
            req.user?.id || null
          ).catch((err) => {
            console.error('[idempotency] Failed to store response:', err);
          });
        }
        
        return originalJson(body);
      };

      next();
    })
    .catch((err) => {
      // If idempotency check fails with a specific error, return it
      if (err instanceof ApiError) {
        return sendError(
          res,
          err.statusCode || 500,
          err.details?.code || 'IDEMPOTENCY_ERROR',
          err.message || 'Idempotency check failed',
          err.details ? { details: err.details } : {}
        );
      }
      // Otherwise, log and continue without idempotency protection
      console.error('[idempotency] Middleware error:', err);
      next();
    });
}
