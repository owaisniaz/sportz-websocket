// utils/app-error.js
export default class AppError extends Error {
  constructor(message, statusCode = 500, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? "fail" : "error";
    this.isOperational = true;
    this.details = details; // e.g. list of validation errors
    Error.captureStackTrace(this, this.constructor);
  }
}