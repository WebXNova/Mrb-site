import { AppError } from '../base/AppError.js';
import {
  ORDER_NOT_FOUND,
  PAYMENT_ALREADY_FULFILLED,
  PAYMENT_FAILED,
  PAYMENT_REQUIRED,
} from '../codes/ErrorCodes.js';

export class PaymentRequiredError extends AppError {
  constructor(message = 'Payment is required to access this course.', metadata = null) {
    super({ message, errorCode: PAYMENT_REQUIRED, httpStatus: 402, metadata });
  }
}

export class OrderNotFoundError extends AppError {
  constructor(message = 'Order not found.', metadata = null) {
    super({ message, errorCode: ORDER_NOT_FOUND, httpStatus: 404, metadata });
  }
}

export class PaymentFailedError extends AppError {
  constructor(message = 'Payment could not be completed.', metadata = null) {
    super({ message, errorCode: PAYMENT_FAILED, httpStatus: 402, metadata });
  }
}

export class PaymentAlreadyFulfilledError extends AppError {
  constructor(message = 'Payment has already been processed.', metadata = null) {
    super({ message, errorCode: PAYMENT_ALREADY_FULFILLED, httpStatus: 409, metadata });
  }
}
