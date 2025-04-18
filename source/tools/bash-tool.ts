import crypto from "node:crypto";
import path from "node:path";
import { isUndefined } from "@travisennis/stdlib/typeguards";
import { tool } from "ai";
import { z } from "zod";
import { executeCommand } from "../utils/index.ts";
import type { SendData } from "./types.ts";

// Whitelist of allowed commands
const ALLOWED_COMMANDS = [
  "ls",
  "cat",
  "grep",
  "find",
  "echo",
  "mkdir",
  "touch",
  // "rm",
  "cp",
  "mv",
  "pwd",
  "wc",
  "diff",
  "sort",
  "head",
  "tail",
  // "test",
  "npm",
  "node",
  "git",
  "gh",
  "rg",
];

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Check if command is in the allowed list
function isCommandAllowed(command: string): boolean {
  const baseCommand = command.split(" ")[0] || "";
  return ALLOWED_COMMANDS.includes(baseCommand);
}

// Check for command chaining attempts
// function hasCommandChaining(command: string): boolean {
//   const chainingPatterns = [";", "&&", "||", "|", "`", "$(", ">", "<"];
//   return chainingPatterns.some((pattern) => command.includes(pattern));
// }

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
      description: `Execute bash commands and return their output. Limited to a whitelist of safe commands: ${ALLOWED_COMMANDS.join(", ")}. Commands will only execute within the project directory for security. Always specify absolute paths to avoid errors.`,
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
        const uuid = crypto.randomUUID();
        sendData?.({
          event: "tool-init",
          id: uuid,
          data: `Executing: ${command} in ${cwd}`,
        });

        // Validate command
        if (!isCommandAllowed(command)) {
          const errorMsg = `Command not allowed: ${command}. Allowed commands: ${ALLOWED_COMMANDS.join(", ")}`;
          sendData?.({ event: "tool-error", id: uuid, data: errorMsg });
          return errorMsg;
        }

        // Check for command chaining
        // if (hasCommandChaining(command)) {
        //   const errorMsg =
        //     "Command chaining is not allowed for security reasons";
        //   sendData?.({ event: "tool-error", id: uuid, data: errorMsg });
        //   return errorMsg;
        // }

        // Validate working directory
        if (!isPathWithinBaseDir(cwd, baseDir)) {
          const errorMsg = `Working directory must be within the project directory: ${baseDir}`;
          sendData?.({ event: "tool-error", id: uuid, data: errorMsg });
          return errorMsg;
        }

        // Validate command arguments for paths outside baseDir
        const parts = command.split(" ");
        for (const part of parts) {
          // Basic check for potential paths (absolute or relative)
          // Also check arguments containing '/' that don't look like options (start with '-')
          if (
            part.startsWith("/") ||
            part.includes("../") ||
            part.includes("./") ||
            (part.includes("/") && !part.startsWith("-"))
          ) {
            try {
              const resolvedPath = path.resolve(cwd, part);
              if (!isPathWithinBaseDir(resolvedPath, baseDir)) {
                const errorMsg = `Command argument references path outside the project directory: ${part} (resolved to ${resolvedPath})`;
                sendData?.({ event: "tool-error", id: uuid, data: errorMsg });
                return errorMsg;
              }
            } catch (e) {
              // Ignore errors during path resolution (e.g., invalid characters)
              console.warn(
                `Could not resolve potential path argument: ${part}`,
                e,
              );
            }
          }
        }

        try {
          const result = format(await asyncExec(command, cwd, timeout));
          sendData?.({
            event: "tool-completion",
            id: uuid,
            data: "Command executed successfully",
          });
          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: uuid,
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
