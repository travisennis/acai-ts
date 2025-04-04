import { isUndefined } from "@travisennis/stdlib/typeguards";
import { tool } from "ai";
import { z } from "zod";
import { executeCommand } from "../utils/index.ts";
import type { SendData } from "./types.ts";
import path from "node:path";

// Whitelist of allowed commands
const ALLOWED_COMMANDS = [
  // "ls",
  // "cat",
  // "grep",
  // "find",
  // "echo",
  // "mkdir",
  // "touch",
  // "rm",
  // "cp",
  // "mv",
  // "pwd",
  // "wc",
  "diff",
  // "sort",
  // "head",
  // "tail",
  // "test",
  "npm",
  // "node",
  "git",
  "gh",
];

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Check if command is in the allowed list
function isCommandAllowed(command: string): boolean {
  const baseCommand = command.split(" ")[0] || "";
  return ALLOWED_COMMANDS.includes(baseCommand);
}

// Check for command chaining attempts
function hasCommandChaining(command: string): boolean {
  const chainingPatterns = [";", "&&", "||", "|", "`", "$(", ">", "<"];
  return chainingPatterns.some((pattern) => command.includes(pattern));
}

// Ensure path is within base directory
function isPathWithinBaseDir(requestedPath: string, baseDir: string): boolean {
  const normalizedRequestedPath = path.normalize(requestedPath);
  const normalizedBaseDir = path.normalize(baseDir);

  return normalizedRequestedPath.startsWith(normalizedBaseDir);
}

export const createBashTools = ({
  baseDir,
  sendData,
}: {
  baseDir: string;
  sendData?: SendData | undefined;
}) => {
  return {
    bashTool: tool({
      description: `Execute bash commands and return their output. Limited to a whitelist of safe commands: ${ALLOWED_COMMANDS.join(", ")}. Command chaining operators (;, &&, |, etc.) are not allowed. Commands will only execute within the project directory for security. Always specify absolute paths to avoid errors.`,
      parameters: z.object({
        command: z
          .string()
          .describe(
            "Full CLI command to execute. Must be from the allowed list without chaining operators.",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Working directory (default: project root). Must be within the project directory.",
          ),
        timeout: z
          .number()
          .optional()
          .describe(
            `Command execution timeout in milliseconds. Default: ${DEFAULT_TIMEOUT}ms`,
          ),
      }),
      execute: async ({
        command,
        cwd = baseDir,
        timeout = DEFAULT_TIMEOUT,
      }) => {
        sendData?.({
          event: "tool-init",
          data: `Executing: ${command} in ${cwd}`,
        });

        // Validate command
        if (!isCommandAllowed(command)) {
          const errorMsg = `Command not allowed: ${command}. Allowed commands: ${ALLOWED_COMMANDS.join(", ")}`;
          sendData?.({ event: "tool-error", data: errorMsg });
          return errorMsg;
        }

        // Check for command chaining
        if (hasCommandChaining(command)) {
          const errorMsg =
            "Command chaining is not allowed for security reasons";
          sendData?.({ event: "tool-error", data: errorMsg });
          return errorMsg;
        }

        // Validate working directory
        if (!isPathWithinBaseDir(cwd, baseDir)) {
          const errorMsg = `Working directory must be within the project directory: ${baseDir}`;
          sendData?.({ event: "tool-error", data: errorMsg });
          return errorMsg;
        }

        try {
          const result = format(await asyncExec(command, cwd, timeout));
          sendData?.({
            event: "tool-completion",
            data: "Command executed successfully",
          });
          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            data: `Command failed: ${(error as Error).message}`,
          });
          return `Command failed: ${(error as Error).message}`;
        }
      },
    }),
  };
};

function format({
  stdout,
  stderr,
}: { stdout: string; stderr: string; code: number }) {
  return `${stdout}\n${stderr}`;
}

function asyncExec(
  command: string,
  cwd: string,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const [cmd, ...args] = command.split(" ");
    if (isUndefined(cmd)) {
      return Promise.resolve({
        stdout: "",
        stderr: "Missing command",
        code: 1,
      });
    }

    return executeCommand([cmd, ...args], {
      cwd,
      timeout,
      shell: true,
      throwOnError: false,
    });
  } catch (error) {
    console.error(error);
    return Promise.resolve({
      stdout: "",
      stderr: "Error executing command",
      code: 1,
    });
  }
}
