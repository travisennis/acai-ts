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
];

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Initialize command validator with allowed commands
const commandValidator = new CommandValidation(ALLOWED_COMMANDS);

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

        // Validate command using CommandValidation
        if (!commandValidator.isValid(command)) {
          const errorMsg = `Command not allowed. Ensure all sub-commands are in the approved list: ${ALLOWED_COMMANDS.join(", ")} and no unsafe operators (>, <, \`, $()) are used.`;
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
            // Log or handle error, but don't block file return
          }

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
          // Adjust max token check message if line selection was used
          const maxTokenMessage = `Output of commmand (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please adjust how you call the command to get back more specific results`;

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
