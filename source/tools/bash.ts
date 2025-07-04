import path from "node:path";
import { isUndefined } from "@travisennis/stdlib/typeguards";
import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import type { TokenCounter } from "../token-utils.ts";
import type { ExecuteResult } from "../utils/process.ts";
import { executeCommand } from "../utils/process.ts";
import type { SendData } from "./types.ts";

export const BashTool = {
  name: "bash" as const,
};

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
  "npx",
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

// command chaining patterns
const patterns = [
  /(?<!&)&&/, // &&
  /(?<!\|)\|\|/, // ||
  // / (?<!\|)\|/, // | // pipe is allowed
  /;/, // ;
  /`/, // backticks
  /\$\(/, // $(
  />/, // redirect out
  /</, // redirect in
];

// Check for command chaining attempts
function hasCommandChaining(command: string): boolean {
  // strip out single- and double-quoted segments
  const stripped = command
    .replace(/'([^'\\]|\\.)*'/g, "")
    .replace(/"([^"\\]|\\.)*"/g, "");
  // detect unquoted chaining operators
  return patterns.some((re) => re.test(stripped));
}

function areAllPipelineCommandsAllowed(command: string): boolean {
  const commands = command.split("|").map((c) => c.trim());
  return commands.every(isCommandAllowed);
}

// Ensure path is within base directory
function isPathWithinBaseDir(requestedPath: string, baseDir: string): boolean {
  const normalizedRequestedPath = path.normalize(requestedPath);
  const normalizedBaseDir = path.normalize(baseDir);

  return normalizedRequestedPath.startsWith(normalizedBaseDir);
}

export const createBashTool = ({
  baseDir,
  sendData,
  tokenCounter,
}: {
  baseDir: string;
  sendData?: SendData | undefined;
  tokenCounter: TokenCounter;
}) => {
  return {
    [BashTool.name]: tool({
      description: `Execute bash commands and return their output. Limited to a whitelist of safe commands: ${ALLOWED_COMMANDS.join(", ")}. Commands will only execute within the project directory for security. Always specify absolute paths to avoid errors.`,
      parameters: z.object({
        command: z
          .string()
          .describe(
            "Full CLI command to execute. Must be from the allowed list without chaining operators.",
          ),
        cwd: z
          .string()
          .nullable()
          .describe(
            "Working directory (default: project root). Must be within the project directory.",
          ),
        timeout: z
          .number()
          .nullable()
          .describe(
            `Command execution timeout in milliseconds. Default: ${DEFAULT_TIMEOUT}ms`,
          ),
      }),
      execute: async ({ command, cwd, timeout }, { toolCallId }) => {
        // Guard against null cwd and timeout
        const safeCwd = cwd == null ? baseDir : cwd;
        const safeTimeout = timeout == null ? DEFAULT_TIMEOUT : timeout;

        sendData?.({
          event: "tool-init",
          id: toolCallId,
          data: `Executing: ${command} in ${safeCwd}`,
        });

        // Check for disallowed command chaining (e.g., &&, ;, etc.)
        if (hasCommandChaining(command)) {
          const errorMsg =
            "Command chaining with operators like &&, ;, ||, <, >, etc. is not allowed.";
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
          return errorMsg;
        }

        // Validate all commands in the potential pipeline.
        // This handles both single commands and piped commands.
        if (!areAllPipelineCommandsAllowed(command)) {
          const errorMsg = `Command not allowed. Each command in a pipeline must be in the approved list: ${ALLOWED_COMMANDS.join(
            ", ",
          )}`;
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
          return errorMsg;
        }

        // Validate working directory
        if (!isPathWithinBaseDir(safeCwd, baseDir)) {
          const errorMsg = `Working directory must be within the project directory: ${baseDir}`;
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
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
              const resolvedPath = path.resolve(safeCwd, part);
              if (!isPathWithinBaseDir(resolvedPath, baseDir)) {
                const errorMsg = `Command argument references path outside the project directory: ${part} (resolved to ${resolvedPath})`;
                sendData?.({
                  event: "tool-error",
                  id: toolCallId,
                  data: errorMsg,
                });
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
          const result = await asyncExec(command, safeCwd, safeTimeout);
          const formattedResult = format(result);

          if (result.signal === "SIGTERM") {
            const timeoutMessage = `Command timed out after ${safeTimeout}ms. This might be because the command is waiting for input.`;
            sendData?.({
              event: "tool-error",
              id: toolCallId,
              data: timeoutMessage,
            });
            return timeoutMessage;
          }

          let tokenCount = 0;
          try {
            tokenCount = tokenCounter.count(formattedResult);
          } catch (tokenError) {
            console.error("Error calculating token count:", tokenError);
            // Log or handle error, but don't block file return
          }

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
          // Adjust max token check message if line selection was used
          const maxTokenMessage = `Output of commmand (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please use adjust how you call the command to get back more specific results`;

          const finalResult =
            tokenCount <= maxTokens ? formattedResult : maxTokenMessage;

          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data:
              tokenCount <= maxTokens
                ? "Command executed successfully."
                : `Output of commmand (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}).`,
          });
          return finalResult;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: toolCallId,
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
}: {
  stdout: string;
  stderr: string;
  code: number;
}) {
  return `${stdout}\n${stderr}`;
}

function asyncExec(
  command: string,
  cwd: string,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<ExecuteResult> {
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
