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
    if (ch === "`") return { ok: false, error: "Backticks are not allowed" };
    if (ch === "$" && i + 1 < n && input[i + 1] === "(") {
      return { ok: false, error: "Command substitution $() is not allowed" };
    }

    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (buf.length > 0) {
        argv.push(buf);
        buf = "";
      }
      i += 1;
      continue;
    }

    if (!inDouble && ch === "'" && !inSingle) {
      inSingle = true;
      i += 1;
      continue;
    }
    if (inSingle && ch === "'") {
      inSingle = false;
      i += 1;
      continue;
    }

    if (!inSingle && ch === '"' && !inDouble) {
      inDouble = true;
      i += 1;
      continue;
    }
    if (inDouble && ch === '"') {
      inDouble = false;
      i += 1;
      continue;
    }

    if (!inSingle && ch === "\\") {
      i += 1;
      if (i >= n) return { ok: false, error: "Dangling escape" };
      const next = input[i] ?? "";
      // Inside double quotes, only escape " and \\ reliably
      if (inDouble && next !== '"' && next !== "\\") {
        // Keep backslash literally for safety
        buf += `\\${next}`;
      } else {
        buf += next;
      }
      i += 1;
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
