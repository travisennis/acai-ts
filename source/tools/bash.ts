import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import { initExecutionEnvironment } from "../execution/index.ts";
import { logger } from "../logger.ts";
import chalk from "../terminal/chalk.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenCounter } from "../token-utils.ts";
import type { AskResponse, ToolExecutor } from "../tool-executor.ts";
import { isMutatingCommand, resolveCwd, validatePaths } from "./bash-utils.ts";
import { isPathWithinBaseDir } from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const BashTool = {
  name: "bash" as const,
};

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

export const createBashTool = async ({
  baseDir,
  sendData,
  tokenCounter,
  terminal,
  toolExecutor,
}: {
  baseDir: string;
  sendData?: SendData;
  tokenCounter: TokenCounter;
  terminal?: Terminal;
  toolExecutor?: ToolExecutor;
}) => {
  return {
    [BashTool.name]: tool({
      description:
        "Execute commands in a shell. Commands execute only within the project directory. Always use absolute paths.",
      inputSchema: z.object({
        command: z.string().describe("Full CLI command to execute."),
        cwd: z
          .string()
          .nullable()
          .describe(
            "Working directory file path (default: project root). Must be within the project directory.",
          ),
        timeout: z
          .number()
          .nullable()
          .describe(
            `Command execution timeout in milliseconds. Default: ${DEFAULT_TIMEOUT}ms`,
          ),
      }),
      execute: async (
        { command, cwd, timeout },
        { toolCallId, abortSignal },
      ) => {
        try {
          if (abortSignal?.aborted) {
            throw new Error("Command execution aborted");
          }
          const resolvedCwd = resolveCwd(cwd, baseDir);
          const safeTimeout = timeout ?? DEFAULT_TIMEOUT;
          console.info(command);
          sendData?.({
            event: "tool-init",
            id: toolCallId,
            data: `Executing: ${chalk.cyan(command)} in ${chalk.cyan(resolvedCwd)}`,
          });

          if (!isPathWithinBaseDir(resolvedCwd, baseDir)) {
            const errorMsg = `Working directory must be within the project directory: ${baseDir}`;
            sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
            return errorMsg;
          }

          const pathValidation = validatePaths(command, baseDir, resolvedCwd);
          if (!pathValidation.isValid) {
            sendData?.({
              event: "tool-error",
              id: toolCallId,
              data: pathValidation.error ?? "Unknown error.",
            });
            return pathValidation.error ?? "Unknown error.";
          }

          if (terminal) {
            terminal.writeln(
              `\n${chalk.blue.bold("●")} Proposing to execute command: ${chalk.cyan(command)} in ${chalk.cyan(resolvedCwd)}`,
            );
            terminal.lineBreak();

            let userResponse: AskResponse | undefined;
            // Prompt only for potentially mutating commands when a toolExecutor is present
            if (toolExecutor && isMutatingCommand(command)) {
              const ctx = {
                toolName: BashTool.name,
                toolCallId,
                message:
                  "What would you like to do with this command execution?",
                choices: {
                  accept: "Execute this command",
                  acceptAll:
                    "Accept all future command executions (including this)",
                  reject: "Reject this command execution",
                },
              };
              try {
                userResponse = await toolExecutor.ask(ctx, { abortSignal });
              } catch (e) {
                if ((e as Error).name === "AbortError") {
                  throw new Error(
                    "Command execution aborted during user input",
                  );
                }
                throw e;
              }
            }

            const { result: userChoice, reason } = userResponse ?? {
              result: "accept",
            };

            terminal.lineBreak();

            if (userChoice === "accept-all") {
              terminal.writeln(
                chalk.yellow(
                  "✓ Auto-accept mode enabled for all command executions",
                ),
              );
              terminal.lineBreak();
            }

            if (userChoice === "reject") {
              terminal.lineBreak();

              const rejectionReason = reason || "No reason provided";
              sendData?.({
                event: "tool-completion",
                id: toolCallId,
                data: `Command execution rejected by user. Reason: ${rejectionReason}`,
              });
              return `The user rejected this command execution. Reason: ${rejectionReason}`;
            }
          }

          if (abortSignal?.aborted) {
            throw new Error(
              "Command execution aborted before running the command",
            );
          }

          const execEnv = await initExecutionEnvironment();
          const { output, exitCode } = await execEnv.executeCommand(command, {
            cwd: resolvedCwd,
            timeout: safeTimeout,
            abortSignal,
            preserveOutputOnError: true,
            captureStderr: true,
            throwOnError: false,
          });

          sendData?.({
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: "Result",
              secondary: output.trim().split("\n").slice(-20),
            },
          });

          let tokenCount = 0;
          try {
            tokenCount = tokenCounter.count(output);
          } catch (tokenError) {
            console.info("Error calculating token count:", tokenError);
          }

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
          const maxTokenMessage = `Output of command (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please adjust how you call the command to get back more specific results`;
          const finalResult =
            tokenCount <= maxTokens ? output : maxTokenMessage;

          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data:
              tokenCount <= maxTokens
                ? `Command executed successfully: ${exitCode} (${tokenCount} tokens)`
                : `Output of command (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}).`,
          });
          return finalResult;
        } catch (error) {
          logger.error(error, "Bash Tool Error:");
          const errorMsg = `Command failed: ${(error as Error).message}`;
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
          return errorMsg;
        }
      },
    }),
  };
};
