#!/usr/bin/env node
/**
 * Standalone input prompt (inquirer-like)
 * - TypeScript version
 */

import * as readline from "node:readline";
import {
  isAbortError,
  isCancelError,
  PromptAbortError,
  PromptCancelError,
} from "./errors.ts";
import style from "./style.ts";

interface InputOptions {
  message?: string; // prompt message
  default?: string; // default value if user presses Enter on empty
  validate?: (input: string) => true | string; // return true if valid, else error message
  required?: boolean; // require non-empty input when no default is provided
  minLength?: number; // minimum input length
  maxLength?: number; // maximum input length
  signal?: AbortSignal;
}

/**
 * Enhanced input validation with built-in and custom validation
 */
function validateInput(input: string, options: InputOptions): true | string {
  const {
    validate,
    required,
    minLength,
    maxLength,
    default: defaultValue,
  } = options;

  // Handle empty input
  const trimmedInput = input.trim();
  if (!trimmedInput && !defaultValue) {
    if (required) {
      return "Input is required";
    }
    return true; // Allow empty if not required
  }

  // Use default value if input is empty
  const finalInput = trimmedInput || defaultValue || "";

  // Length validations
  if (minLength && finalInput.length < minLength) {
    return `Input must be at least ${minLength} characters`;
  }

  if (maxLength && finalInput.length > maxLength) {
    return `Input must be at most ${maxLength} characters`;
  }

  // Custom validation
  if (validate) {
    return validate(finalInput);
  }

  return true;
}

/**
 * Create a managed readline interface with proper cleanup
 */
function createReadlineInterface(): {
  rl: readline.Interface;
  cleanup: () => void;
} {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    rl.close();
  };

  return { rl, cleanup };
}

/**
 * Non-blocking question wrapper using Promise
 */
function askQuestion(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * Main prompt function with retry logic for validation
 */
async function promptWithRetry(
  rl: readline.Interface,
  prompt: string,
  options: InputOptions,
): Promise<string> {
  const {
    validate,
    required,
    minLength,
    maxLength,
    default: defaultValue,
  } = options;

  while (true) {
    try {
      const answer = await askQuestion(rl, prompt);
      const validationResult = validateInput(answer, {
        validate,
        required,
        minLength,
        maxLength,
        default: defaultValue,
      });

      if (validationResult === true) {
        // Determine final answer
        let finalAnswer = answer.trim();
        if (!finalAnswer && defaultValue !== undefined) {
          finalAnswer = defaultValue;
        }
        return finalAnswer;
      }

      // Show validation error and retry
      console.log(style.red(validationResult));
    } catch (error) {
      if (isAbortError(error) || isCancelError(error)) {
        throw error;
      }
      // Handle other errors appropriately
      throw new Error("Failed to read input", { cause: error });
    }
  }
}

export async function input({
  message = "Enter value",
  default: defaultValue,
  validate,
  required = false,
  minLength,
  maxLength,
  signal,
}: InputOptions = {}): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("TTY required");
  }

  const { rl, cleanup } = createReadlineInterface();
  let cleanupCalled = false;

  const ensureCleanup = () => {
    if (!cleanupCalled) {
      cleanupCalled = true;
      cleanup();
    }
  };

  try {
    return await new Promise((resolve, reject) => {
      const prompt = defaultValue
        ? `${message} (${defaultValue}): `
        : `${message}: `;

      // Handle abort signal
      if (signal) {
        signal.addEventListener("abort", () => {
          ensureCleanup();
          reject(new PromptAbortError());
        });
      }

      // Handle SIGINT (Ctrl+C)
      rl.on("SIGINT", () => {
        ensureCleanup();
        reject(new PromptCancelError());
      });

      // Start the prompt process
      promptWithRetry(rl, prompt, {
        message,
        default: defaultValue,
        validate,
        required,
        minLength,
        maxLength,
        signal,
      })
        .then((result) => {
          ensureCleanup();
          resolve(result);
        })
        .catch((error) => {
          ensureCleanup();
          reject(error);
        });
    });
  } catch (error) {
    ensureCleanup();
    throw error;
  }
}

// Quick test when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const name = await input({
        message: "What is your name",
        default: "Anonymous",
        validate: (txt) => (txt.length < 2 ? "Name too short" : true),
        required: true,
        minLength: 2,
      });
      console.log("Hello,", name);
      process.exit(0);
    } catch (err) {
      if (isCancelError(err)) {
        console.error("Cancelled");
        process.exit(2);
      } else if (isAbortError(err)) {
        console.error("Aborted");
        process.exit(3);
      } else {
        console.error(err);
        process.exit(1);
      }
    }
  })();
}
