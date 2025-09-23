import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import { initExecutionEnvironment } from "../execution/index.ts";
import chalk from "../terminal/chalk.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenCounter } from "../token-utils.ts";
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
          const safeTimeout = timeout == null ? DEFAULT_TIMEOUT : timeout;

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

          // Prompt user for command execution approval (only in interactive mode)
          if (terminal) {
            if (!autoAcceptCommands) {
              await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(resolve, 1000);
                abortSignal?.addEventListener("abort", () => {
                  clearTimeout(timeoutId);
                  reject(new Error("Delay aborted"));
                });
              });
              terminal.lineBreak();
              terminal.writeln(
                `${chalk.blue.bold("●")} About to execute command: ${chalk.cyan(command)}`,
              );
              terminal.writeln(
                `${chalk.gray("Working directory:")} ${resolvedCwd}`,
              );
              terminal.lineBreak();
            }

            let userChoice: string;
            if (autoAcceptCommands) {
              terminal.writeln(
                chalk.green(
                  "✓ Auto-accepting command (all future commands will be accepted)",
                ),
              );
              userChoice = "accept";
            } else {
              try {
                userChoice = await select(
                  {
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
                  },
                  {
                    signal: abortSignal,
                  },
                );
              } catch (e) {
                if ((e as Error).name === "AbortError") {
                  throw new Error(
                    "Command execution aborted during user input",
                  );
                }
                throw e;
              }
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
              let reason: string;
              try {
                reason = await input(
                  { message: "Feedback: " },
                  { signal: abortSignal },
                );
              } catch (e) {
                if ((e as Error).name === "AbortError") {
                  throw new Error(
                    "Command execution aborted during user input",
                  );
                }
                throw e;
              }
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
          const errorMsg = `Command failed: ${(error as Error).message}`;
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
          return errorMsg;
        }
      },
    }),
  };
};
