/**
 * API-layer guard — blocks question bank mutations when linked to a published test.
 */

import { AppError } from '../errors/base/AppError.js';
import { VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import { enforceQuestionBankMutationAllowed } from '../services/publishedTestLock.service.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireQuestionBankWritable(req, res, next) {
  try {
    const questionId = Number(req.params.id);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return next(
        new AppError({
          message: 'Invalid question id.',
          errorCode: VALIDATION_ERROR,
          httpStatus: 400,
          isOperational: true,
        })
      );
    }

    await enforceQuestionBankMutationAllowed(questionId);

    next();
  } catch (error) {
    next(error);
  }
}
