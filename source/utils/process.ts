import { execFile } from "node:child_process";
import { isUndefined } from "@travisennis/stdlib/typeguards";

const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const DEFAULT_TIMEOUT = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND;

export interface ExecuteOptions {
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

export interface ExecuteResult {
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code (0 for success, non-zero for errors) */
  code: number;
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
    const parts = command.split(" ");
    cmd = parts[0] ?? "";
    args = parts.slice(1);
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
            const errorCode = typeof error.code === "number" ? error.code : 1;
            const result: ExecuteResult = {
              stdout: preserveOutputOnError ? stdout : "",
              stderr: preserveOutputOnError ? stderr : "",
              code: errorCode,
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
