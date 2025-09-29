#!/usr/bin/env node
/**
 * Standalone input prompt (inquirer-like)
 * - TypeScript version
 */

import * as readline from "node:readline";

export interface InputOptions {
  message?: string; // prompt message
  default?: string; // default value if user presses Enter on empty
  validate?: (input: string) => true | string; // return true if valid, else error message
  signal?: AbortSignal;
}

export async function input({
  message = "Enter value",
  default: defaultValue,
  validate,
  signal,
}: InputOptions = {}): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("TTY required");
  }

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      rl.close();
    }

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        cleanup();
        const err = new Error("AbortError") as Error & { name?: string };
        err.name = "AbortError";
        reject(err);
      });
    }

    const prompt = defaultValue
      ? `${message} (${defaultValue}): `
      : `${message}: `;

    function ask() {
      rl.question(prompt, (answer: string) => {
        let finalAnswer = answer.trim();
        if (!finalAnswer && defaultValue !== undefined) {
          finalAnswer = defaultValue;
        }

        if (validate) {
          const result = validate(finalAnswer);
          if (result !== true) {
            // show error and re-ask
            console.log(`\x1b[31m${result}\x1b[0m`); // red error
            ask();
            return;
          }
        }

        cleanup();
        resolve(finalAnswer);
      });
    }

    rl.on("SIGINT", () => {
      cleanup();
      const err = new Error("Cancelled") as Error & { isCanceled?: boolean };
      err.isCanceled = true;
      reject(err);
    });

    ask();
  });
}

// Quick test when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const name = await input({
        message: "What is your name",
        default: "Anonymous",
        validate: (txt) => (txt.length < 2 ? "Name too short" : true),
      });
      console.log("Hello,", name);
      process.exit(0);
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "isCanceled" in err &&
        err.isCanceled
      ) {
        console.error("Cancelled");
        process.exit(2);
      } else {
        console.error(err);
        process.exit(1);
      }
    }
  })();
}
