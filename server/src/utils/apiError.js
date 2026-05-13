export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code =
      details !== null && typeof details === 'object' && typeof details.code === 'string' ? details.code : null;
  }
}
