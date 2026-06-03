/**
 * @deprecated Prefer throwing AppError subclasses from `errors/` — kept for backward compatibility.
 * The global error handler bridges ApiError → AppError automatically.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code =
      details !== null && typeof details === 'object' && typeof details.code === 'string' ? details.code : null;
  }
}
