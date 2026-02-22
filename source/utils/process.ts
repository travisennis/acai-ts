import { execFile } from "node:child_process";
import { isUndefined } from "@travisennis/stdlib/typeguards";

const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const DEFAULT_TIMEOUT = 2 * SECONDS_IN_MINUTE * MS_IN_SECOND;

interface ExecuteOptions {
  /** Working directory where the command will be executed */
  cwd?: string;
  /** Timeout in milliseconds before killing the process */
  timeout?: number;
  /** AbortSignal to cancel the execution */
  abortSignal?: AbortSignal;
  /** Whether to use shell syntax (defaults to false) */
  shell?: boolean;
  /** Whether to throw an error on non-zero exit codes (defaults to false) */
  throwOnError?: boolean;
  /** Whether to include stdout/stderr in the result even when there's an error (defaults to true) */
  preserveOutputOnError?: boolean;
  /** Maximum buffer size in bytes (defaults to 1MB) */
  maxBuffer?: number;
}

interface ExecuteResult {
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code (0 for success, non-zero for errors) */
  code: number;
  /** The signal that terminated the process, if any */
  signal?: NodeJS.Signals;
}

type ParseResult =
  | { ok: true; argv: [string, ...string[]] }
  | { ok: false; error: string };

/**
 * Checks for shell-only constructs that are not allowed.
 */
function checkShellConstructs(
  input: string,
  i: number,
  ch: string,
): { ok: false; error: string } | null {
  if (ch === "`") {
    return { ok: false, error: "Backticks are not allowed" };
  }
  if (ch === "$" && i + 1 < input.length && input[i + 1] === "(") {
    return { ok: false, error: "Command substitution $() is not allowed" };
  }
  return null;
}

/**
 * Handles whitespace outside of quotes.
 */
function handleWhitespace(
  ch: string,
  inSingle: boolean,
  inDouble: boolean,
  argv: string[],
  currentBuf: string,
): { done: boolean; buf: string } | null {
  if (!inSingle && !inDouble && /\s/.test(ch)) {
    if (currentBuf.length > 0) {
      argv.push(currentBuf);
    }
    return { done: true, buf: "" };
  }
  return null;
}

/**
 * Handles single quote state transitions.
 */
function handleSingleQuote(
  ch: string,
  inSingle: boolean,
  inDouble: boolean,
): { inSingle: boolean; done: boolean } | null {
  if (!inDouble && ch === "'" && !inSingle) {
    return { inSingle: true, done: true };
  }
  if (inSingle && ch === "'") {
    return { inSingle: false, done: true };
  }
  return null;
}

/**
 * Handles double quote state transitions.
 */
function handleDoubleQuote(
  ch: string,
  inSingle: boolean,
  inDouble: boolean,
): { inDouble: boolean; done: boolean } | null {
  if (!inSingle && ch === '"' && !inDouble) {
    return { inDouble: true, done: true };
  }
  if (inDouble && ch === '"') {
    return { inDouble: false, done: true };
  }
  return null;
}

/**
 * Handles escape sequences.
 * Returns the new buffer and index after handling the escape.
 */
function handleEscape(
  input: string,
  i: number,
  ch: string,
  inSingle: boolean,
  inDouble: boolean,
  buf: string,
):
  | { buf: string; i: number; ok: false; error: string }
  | { buf: string; i: number }
  | null {
  if (!inSingle && ch === "\\") {
    const nextIndex = i + 1;
    if (nextIndex >= input.length) {
      return { buf, i: nextIndex, ok: false, error: "Dangling escape" };
    }
    const next = input[nextIndex] ?? "";
    // Inside double quotes, only escape " and \\ reliably
    if (inDouble && next !== '"' && next !== "\\") {
      // Keep backslash literally for safety
      return { buf: `${buf}\\${next}`, i: nextIndex + 1 };
    }
    return { buf: buf + next, i: nextIndex + 1 };
  }
  return null;
}

// Quote/escape-aware argv tokenizer that forbids command substitution
export function parseArgv(input: string): ParseResult {
  const argv: string[] = [];
  let buf = "";
  let i = 0;
  const n = input.length;
  let inSingle = false;
  let inDouble = false;

  while (i < n) {
    const ch = input[i] ?? "";

    // Reject shell-only constructs early
    const shellError = checkShellConstructs(input, i, ch);
    if (shellError) return shellError;

    // Handle whitespace
    const whitespace = handleWhitespace(ch, inSingle, inDouble, argv, buf);
    if (whitespace) {
      buf = whitespace.buf;
      i += 1;
      continue;
    }

    // Handle single quotes
    const singleQuote = handleSingleQuote(ch, inSingle, inDouble);
    if (singleQuote) {
      inSingle = singleQuote.inSingle;
      i += 1;
      continue;
    }

    // Handle double quotes
    const doubleQuote = handleDoubleQuote(ch, inSingle, inDouble);
    if (doubleQuote) {
      inDouble = doubleQuote.inDouble;
      i += 1;
      continue;
    }

    // Handle escape sequences
    const escapeResult = handleEscape(input, i, ch, inSingle, inDouble, buf);
    if (escapeResult) {
      if ("ok" in escapeResult && !escapeResult.ok) {
        return escapeResult;
      }
      buf = escapeResult.buf;
      i = escapeResult.i;
      continue;
    }

    buf += ch;
    i += 1;
  }

  if (inSingle || inDouble) return { ok: false, error: "Unterminated quote" };
  if (buf.length > 0) argv.push(buf);
  if (argv.length === 0) return { ok: false, error: "Empty command" };
  const first = argv[0];
  if (typeof first !== "string" || first.trim() === "") {
    return { ok: false, error: "Missing command" };
  }
  return { ok: true, argv: argv as [string, ...string[]] };
}

/**
 * Executes a command and returns the result, providing unified error handling
 *
 * @param command Either a string command with arguments or an array where the first item is the command
 *               and the rest are arguments
 * @param options Execution options
 * @returns Promise resolving to an object containing stdout, stderr, and exit code
 */
export function executeCommand(
  command: string | [string, ...string[]],
  options?: ExecuteOptions,
): Promise<ExecuteResult> {
  const {
    cwd = process.cwd(),
    timeout = DEFAULT_TIMEOUT,
    abortSignal,
    shell = false,
    throwOnError = false,
    preserveOutputOnError = true,
    maxBuffer = 1_000_000,
  } = options || {};

  let cmd: string;
  let args: string[];

  if (Array.isArray(command)) {
    [cmd, ...args] = command;
  } else {
    const parsed = parseArgv(command);
    if (!parsed.ok) {
      const result: ExecuteResult = {
        stdout: "",
        stderr: parsed.error,
        code: 1,
      };
      return throwOnError
        ? Promise.reject(new Error(parsed.error))
        : Promise.resolve(result);
    }
    [cmd, ...args] = parsed.argv;
  }

  if (isUndefined(cmd) || cmd.trim() === "") {
    const result: ExecuteResult = {
      stdout: "",
      stderr: "Missing command",
      code: 1,
    };
    return throwOnError
      ? Promise.reject(new Error("Missing command"))
      : Promise.resolve(result);
  }

  if (abortSignal?.aborted) {
    const result: ExecuteResult = {
      stdout: "",
      stderr: "Command execution aborted",
      code: 130,
    };
    return throwOnError
      ? Promise.reject(new Error("Command execution aborted"))
      : Promise.resolve(result);
  }

  return new Promise<ExecuteResult>((resolve, reject) => {
    try {
      execFile(
        cmd,
        args,
        {
          cwd,
          timeout,
          signal: abortSignal,
          shell,
          maxBuffer,
        },
        (error, stdout, stderr) => {
          if (error) {
            let errorCode = typeof error.code === "number" ? error.code : 1;
            let errorSignal = error.signal ?? undefined;

            if (error.name === "AbortError") {
              errorCode = 130;
              errorSignal = "SIGINT";
            }

            const result: ExecuteResult = {
              stdout: preserveOutputOnError ? stdout : "",
              stderr: preserveOutputOnError ? stderr : "",
              code: errorCode,
              signal: errorSignal,
            };

            if (throwOnError) {
              reject(Object.assign(error, { result }));
            } else {
              resolve(result);
            }
          } else {
            resolve({ stdout, stderr, code: 0 });
          }
        },
      );
    } catch (error) {
      const result: ExecuteResult = { stdout: "", stderr: "", code: 1 };
      if (throwOnError) {
        reject(error);
      } else {
        resolve(result);
      }
    }
  });
}
