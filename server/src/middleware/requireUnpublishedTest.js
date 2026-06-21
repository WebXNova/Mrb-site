/**
 * API-layer guard — rejects mutations on published tests before handlers run.
 */

import { ApiError } from '../utils/apiError.js';
import { AppError } from '../errors/base/AppError.js';
import { enforceUnpublishedTest } from '../services/publishedTestLock.service.js';
import { parsePositiveTestIdParam } from '../validators/testRules.schema.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireUnpublishedTest(req, res, next) {
  try {
    const parsed = parsePositiveTestIdParam(req.params.testId);
    if (!parsed.ok) {
      throw new ApiError(400, 'Invalid test id', parsed.error);
    }

    await enforceUnpublishedTest(parsed.id, undefined, {
      reason: 'API_MUTATION_ON_PUBLISHED_TEST',
    });

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(error);
  }
}
