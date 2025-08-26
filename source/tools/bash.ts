import path from "node:path";
import { input, select } from "@inquirer/prompts";
import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { config } from "../config.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenCounter } from "../token-utils.ts";
import { executeCommand } from "../utils/process.ts";
import { CommandValidation } from "./command-validation.ts";
import type { SendData } from "./types.ts";

export const BashTool = {
  name: "bash" as const,
};

// Whitelist of allowed commands
const ALLOWED_COMMANDS = [
  "chmod",
  "ls",
  "pwd",
  "cat",
  "grep",
  "find",
  "echo",
  "mkdir",
  "touch",
  "cp",
  "mv",
  "pwd",
  "wc",
  "diff",
  "sort",
  "head",
  "tail",
  "sleep",
  "npm",
  "npx",
  "node",
  "git",
  "gh",
  "rg",
  "jq",
  "sed",
  "awk",
];

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

// Ensure path is within base directory
function isPathWithinBaseDir(requestedPath: string, baseDir: string): boolean {
  const normalizedRequestedPath = path.normalize(requestedPath);
  const normalizedBaseDir = path.normalize(baseDir);
  return normalizedRequestedPath.startsWith(normalizedBaseDir);
}

// Validate path arguments to ensure they're within the project
function validatePaths(
  command: string,
  baseDir: string,
  cwd: string,
): { isValid: boolean; error?: string } {
  // Simple tokenization - split on spaces but respect quotes
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      current += char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
      current += char;
    } else if (char === " " && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);

  // Check each token that looks like a path
  for (let i = 1; i < tokens.length; i++) {
    // Skip the command itself
    const token = tokens[i];
    if (!token) continue;

    // Remove quotes for path checking
    const cleanToken = token.replace(/^['"]|['"]$/g, "");

    // Skip if it's clearly not a path
    if (
      cleanToken.startsWith("-") ||
      cleanToken.includes("://") ||
      !cleanToken.includes("/")
    ) {
      continue;
    }

    // Skip git commit messages and other special cases
    const prevToken = tokens[i - 1]?.replace(/^['"]|['"]$/g, "");
    if (prevToken === "-m" || prevToken === "--message") {
      continue;
    }

    try {
      const resolvedPath = path.resolve(cwd, cleanToken);
      if (!isPathWithinBaseDir(resolvedPath, baseDir)) {
        return {
          isValid: false,
          error: `Path '${cleanToken}' resolves outside the project directory (${resolvedPath}). All paths must be within ${baseDir}`,
        };
      }
    } catch (_e) {}
  }

  return { isValid: true };
}

// Initialize command validator with allowed commands
const commandValidator = new CommandValidation(ALLOWED_COMMANDS);

export const createBashTool = ({
  baseDir,
  sendData,
  tokenCounter,
  terminal,
  autoAcceptAll,
}: {
  baseDir: string;
  sendData?: SendData | undefined;
  tokenCounter: TokenCounter;
  terminal?: Terminal;
  autoAcceptAll: boolean;
}) => {
  let autoAcceptCommands = autoAcceptAll;

  return {
    [BashTool.name]: tool({
      description: `Execute bash commands and return their output. Limited to a whitelist of safe commands: ${ALLOWED_COMMANDS.join(", ")}. Commands will only execute within the project directory for security. Always specify absolute paths to avoid errors.`,
      inputSchema: z.object({
        command: z.string().describe("Full CLI command to execute."),
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
          data: `Executing: ${chalk.cyan(command)} in ${chalk.cyan(safeCwd)}`,
        });

        // Validate working directory
        if (!isPathWithinBaseDir(safeCwd, baseDir)) {
          const errorMsg = `Working directory must be within the project directory: ${baseDir}`;
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
          return errorMsg;
        }

        // Validate command using improved validation
        const commandValidation = commandValidator.isValid(command);
        if (!commandValidation.isValid) {
          sendData?.({
            event: "tool-error",
            id: toolCallId,
            data: commandValidation.error ?? "Unknown error.",
          });
          return commandValidation.error ?? "Unknown error.";
        }

        // Validate paths
        const pathValidation = validatePaths(command, baseDir, safeCwd);
        if (!pathValidation.isValid) {
          sendData?.({
            event: "tool-error",
            id: toolCallId,
            data: pathValidation.error ?? "Unknown error.",
          });
          return pathValidation.error ?? "Unknown error.";
        }

        // Prompt user for command execution approval (only in interactive mode)
        if (terminal) {
          if (!autoAcceptCommands) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          terminal.lineBreak();
          terminal.writeln(
            `${chalk.blue.bold("●")} About to execute command: ${chalk.cyan(command)}`,
          );
          terminal.writeln(`${chalk.gray("Working directory:")} ${safeCwd}`);
          terminal.lineBreak();

          let userChoice: string;
          if (autoAcceptCommands) {
            terminal.writeln(
              chalk.green(
                "✓ Auto-accepting command (all future commands will be accepted)",
              ),
            );
            userChoice = "accept";
          } else {
            userChoice = await select({
              message: "What would you like to do with this command?",
              choices: [
                { name: "Execute this command", value: "accept" },
                {
                  name: "Execute all future commands (including this)",
                  value: "accept-all",
                },
                { name: "Reject this command", value: "reject" },
              ],
              default: "accept",
            });
          }

          terminal.lineBreak();

          if (userChoice === "accept-all") {
            autoAcceptCommands = true;
            terminal.writeln(
              chalk.yellow(
                "✓ Auto-accept mode enabled for all future commands",
              ),
            );
            terminal.lineBreak();
          }

          if (userChoice === "reject") {
            const reason = await input({ message: "Feedback: " });
            terminal.lineBreak();

            const rejectionMsg = `Command rejected by user. Reason: ${reason}`;
            sendData?.({
              event: "tool-completion",
              id: toolCallId,
              data: rejectionMsg,
            });
            return rejectionMsg;
          }
        }

        // Execute command
        try {
          const result = await executeCommand(command, {
            cwd: safeCwd,
            timeout: safeTimeout,
            shell: true,
            throwOnError: false,
          });

          if (result.signal === "SIGTERM") {
            const timeoutMessage = `Command timed out after ${safeTimeout}ms. This might be because the command is waiting for input.`;
            sendData?.({
              event: "tool-error",
              id: toolCallId,
              data: timeoutMessage,
            });
            return timeoutMessage;
          }

          const formattedResult = format(result);

          sendData?.({
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: "Result",
              secondary: formattedResult.split("\n").slice(-5),
            },
          });

          let tokenCount = 0;
          try {
            tokenCount = tokenCounter.count(formattedResult);
          } catch (tokenError) {
            console.error("Error calculating token count:", tokenError);
          }

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
          const maxTokenMessage = `Output of command (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please adjust how you call the command to get back more specific results`;

          const finalResult =
            tokenCount <= maxTokens ? formattedResult : maxTokenMessage;

          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data:
              tokenCount <= maxTokens
                ? "Command executed successfully."
                : `Output of command (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}).`,
          });
          return finalResult;
        } catch (error) {
          const errorMsg = `Command failed: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            id: toolCallId,
            data: errorMsg,
          });
          return errorMsg;
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
