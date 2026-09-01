import { AppError } from '../base/AppError.js';
import { MEDIA_ACCESS_DENIED, MEDIA_NOT_FOUND, UPLOAD_REJECTED } from '../codes/ErrorCodes.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Callers often pass metadata as the first argument; AppError requires a string message. */
function mediaErrorArgs(messageOrMetadata, metadata, fallbackMessage) {
  if (isPlainObject(messageOrMetadata)) {
    return {
      message: fallbackMessage,
      metadata: isPlainObject(metadata) ? { ...messageOrMetadata, ...metadata } : messageOrMetadata,
    };
  }
  const message =
    typeof messageOrMetadata === 'string' && messageOrMetadata.trim()
      ? messageOrMetadata.trim()
      : fallbackMessage;
  return { message, metadata: isPlainObject(metadata) ? metadata : null };
}

export class MediaAccessDeniedError extends AppError {
  constructor(message = 'You do not have permission to access this file.', metadata = null) {
    const args = mediaErrorArgs(
      message,
      metadata,
      'You do not have permission to access this file.'
    );
    super({
      message: args.message,
      errorCode: MEDIA_ACCESS_DENIED,
      httpStatus: 403,
      metadata: args.metadata,
    });
  }
}

export class MediaNotFoundError extends AppError {
  constructor(message = 'File not found.', metadata = null) {
    const args = mediaErrorArgs(message, metadata, 'File not found.');
    super({
      message: args.message,
      errorCode: MEDIA_NOT_FOUND,
      httpStatus: 404,
      metadata: args.metadata,
    });
  }
}

export class UploadRejectedError extends AppError {
  constructor(message = 'Upload was rejected.', metadata = null) {
    super({ message, errorCode: UPLOAD_REJECTED, httpStatus: 400, metadata });
  }
}
