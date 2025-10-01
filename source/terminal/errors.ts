/**
 * Custom error classes for terminal prompts
 */

export class PromptError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PromptError";
  }
}

export class PromptAbortError extends PromptError {
  constructor(message = "Prompt aborted") {
    super(message);
    this.name = "PromptAbortError";
  }
}

export class PromptCancelError extends PromptError {
  constructor(message = "Prompt cancelled by user") {
    super(message);
    this.name = "PromptCancelError";
  }
}

export class PromptValidationError extends PromptError {
  constructor(message: string) {
    super(message);
    this.name = "PromptValidationError";
  }
}

// Type guards for error handling
export function isAbortError(error: unknown): error is PromptAbortError {
  return error instanceof Error && error.name === "PromptAbortError";
}

export function isCancelError(error: unknown): error is PromptCancelError {
  return error instanceof Error && error.name === "PromptCancelError";
}

export function isPromptError(error: unknown): error is PromptError {
  return error instanceof PromptError;
}
