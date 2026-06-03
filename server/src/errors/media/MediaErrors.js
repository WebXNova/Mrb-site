import { AppError } from '../base/AppError.js';
import { MEDIA_ACCESS_DENIED, MEDIA_NOT_FOUND, UPLOAD_REJECTED } from '../codes/ErrorCodes.js';

export class MediaAccessDeniedError extends AppError {
  constructor(message = 'You do not have permission to access this file.', metadata = null) {
    super({ message, errorCode: MEDIA_ACCESS_DENIED, httpStatus: 403, metadata });
  }
}

export class MediaNotFoundError extends AppError {
  constructor(message = 'File not found.', metadata = null) {
    super({ message, errorCode: MEDIA_NOT_FOUND, httpStatus: 404, metadata });
  }
}

export class UploadRejectedError extends AppError {
  constructor(message = 'Upload was rejected.', metadata = null) {
    super({ message, errorCode: UPLOAD_REJECTED, httpStatus: 400, metadata });
  }
}
