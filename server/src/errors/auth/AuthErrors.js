import { AppError } from '../base/AppError.js';
import {
  ADMIN_ACCESS_REQUIRED,
  AUTH_REQUIRED,
  EMAIL_VERIFICATION_REQUIRED,
  INVALID_TOKEN,
  SESSION_EXPIRED,
  STEP_UP_REQUIRED,
  STUDENT_ACCESS_REQUIRED,
  ACCOUNT_RISK_BLOCKED,
} from '../codes/ErrorCodes.js';

export class AuthRequiredError extends AppError {
  constructor(message = 'Authentication required.', metadata = null) {
    super({ message, errorCode: AUTH_REQUIRED, httpStatus: 401, metadata });
  }
}

export class SessionExpiredError extends AppError {
  constructor(message = 'Session expired. Please sign in again.', metadata = null) {
    super({ message, errorCode: SESSION_EXPIRED, httpStatus: 401, metadata });
  }
}

export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid or expired token.', metadata = null) {
    super({ message, errorCode: INVALID_TOKEN, httpStatus: 401, metadata });
  }
}

export class AdminAccessRequiredError extends AppError {
  constructor(message = 'Admin access required.', metadata = null) {
    super({ message, errorCode: ADMIN_ACCESS_REQUIRED, httpStatus: 403, metadata });
  }
}

export class StudentAccessRequiredError extends AppError {
  constructor(message = 'Student access required.', metadata = null) {
    super({ message, errorCode: STUDENT_ACCESS_REQUIRED, httpStatus: 403, metadata });
  }
}

export class EmailVerificationRequiredError extends AppError {
  constructor(message = 'Email verification required.', metadata = null) {
    super({ message, errorCode: EMAIL_VERIFICATION_REQUIRED, httpStatus: 403, metadata });
  }
}

export class StepUpRequiredError extends AppError {
  constructor(message = 'Recent sign-in or step-up verification required.', metadata = null) {
    super({ message, errorCode: STEP_UP_REQUIRED, httpStatus: 403, metadata });
  }
}

export class AccountRiskBlockedError extends AppError {
  constructor(message = 'Account requires additional verification.', metadata = null) {
    super({ message, errorCode: ACCOUNT_RISK_BLOCKED, httpStatus: 403, metadata });
  }
}
