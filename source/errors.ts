/**
 * This module defines custom error classes and a global error handler for the Acai project.
 */

/**
 * Base error class for Acai-specific errors.
 * @extends Error
 */
export class AcaiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcaiError";
  }
}

/**
 * Error class for file operation errors.
 * @extends AcaiError
 */
export class FileOperationError extends AcaiError {
  constructor(message: string) {
    super(message);
    this.name = "FileOperationError";
  }
}

/**
 * Error class for API-related errors.
 * @extends AcaiError
 */
export class ApiError extends AcaiError {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Global error handler function.
 * @param {Error} error - The error to be handled.
 * @throws {Error} Rethrows the error after logging it.
 */
export function handleError(error: Error): void {
  if (error instanceof AcaiError) {
    console.error(`${error.name}: ${error.message}`);
  } else {
    console.error(`Unexpected error: ${error.message}`);
    console.error(error);
  }
  // You might want to add more specific handling based on error types
}
