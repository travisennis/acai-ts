import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import { initExecutionEnvironment } from "../execution/index.ts";
import { logger } from "../logger.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { AskResponse, ToolExecutor } from "../tool-executor.ts";
import { isMutatingCommand, resolveCwd, validatePaths } from "./bash-utils.ts";
import { isPathWithinAllowedDirs } from "./filesystem-utils.ts";
import type { ToolResult } from "./types.ts";

export const BashTool = {
  name: "bash" as const,
};

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

const inputSchema = z.object({
  command: z.string().describe("Full CLI command to execute."),
  cwd: z
    .string()
    .nullable()
    .describe(
      "Working directory file path (default: project root). Must be within the project directory.",
    ),
  timeout: z.coerce
    .number()
    .nullable()
    .describe(
      `Command execution timeout in milliseconds. Default: ${DEFAULT_TIMEOUT}ms`,
    ),
});

type BashInputSchema = z.infer<typeof inputSchema>;

export const createBashTool = async ({
  baseDir,
  allowedDirs,
  tokenCounter,
  terminal,
  toolExecutor,
}: {
  baseDir: string;
  allowedDirs?: string[];
  tokenCounter: TokenCounter;
  terminal?: Terminal;
  toolExecutor?: ToolExecutor;
}) => {
  const execEnv = await initExecutionEnvironment();
  const projectConfig = await config.readProjectConfig();
  const allowedPaths = projectConfig.logs?.path
    ? [projectConfig.logs.path]
    : [];
  const allowedDirectories = allowedDirs ?? [baseDir];
  return {
    toolDef: {
      description:
        "Execute commands in a shell. Commands execute only within the project directory. Always use absolute paths.",
      inputSchema,
    },
    async *execute(
      { command, cwd, timeout }: BashInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("Command execution aborted");
        }
        // grok doesn't follow my instructions
        const safeCwd = cwd === "null" ? null : cwd;
        const resolvedCwd = resolveCwd(safeCwd, baseDir);
        const safeTimeout = timeout ?? DEFAULT_TIMEOUT;
        yield {
          event: "tool-init",
          id: toolCallId,
          data: `Bash: ${style.cyan(command)}`,
        };

        if (!isPathWithinAllowedDirs(resolvedCwd, allowedDirectories)) {
          const errorMsg = `Working directory must be within the allowed directories: ${allowedDirectories.join(", ")}`;
          yield { event: "tool-error", id: toolCallId, data: errorMsg };
          yield errorMsg;
          return;
        }

        const pathValidation = validatePaths(
          command,
          allowedDirectories,
          resolvedCwd,
          allowedPaths,
        );
        if (!pathValidation.isValid) {
          yield {
            event: "tool-error",
            id: toolCallId,
            data: pathValidation.error ?? "Unknown error.",
          };
          yield pathValidation.error ?? "Unknown error.";
          return;
        }

        if (abortSignal?.aborted) {
          throw new Error(
            "Command execution aborted before running the command",
          );
        }

        const { output, exitCode } = await execEnv.executeCommand(command, {
          cwd: resolvedCwd,
          timeout: safeTimeout,
          abortSignal,
          preserveOutputOnError: true,
          captureStderr: true,
          throwOnError: false,
        });

        yield {
          event: "tool-update",
          id: toolCallId,
          data: {
            primary: "Result",
            secondary: output.trim().split("\n").slice(-20),
          },
        };

        let tokenCount = 0;
        try {
          tokenCount = tokenCounter.count(output);
        } catch (tokenError) {
          console.info("Error calculating token count:", tokenError);
        }

        const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
        const maxTokenMessage = `Output of command (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please adjust how you call the command to get back more specific results.`;
        const finalResult = tokenCount <= maxTokens ? output : maxTokenMessage;

        yield {
          event: "tool-completion",
          id: toolCallId,
          data:
            tokenCount <= maxTokens
              ? `Command executed successfully: ${exitCode} (${tokenCount} tokens)`
              : `Output of command (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}).`,
        };

        yield finalResult;
      } catch (error) {
        logger.error(error, "Bash Tool Error:");
        const errorMsg = `Command failed: ${(error as Error).message}`;
        yield { event: "tool-error", id: toolCallId, data: errorMsg };
        yield errorMsg;
      }
    },
    ask: async (
      { command, cwd }: { command: string; cwd: string },
      {
        toolCallId,
        abortSignal,
      }: { toolCallId: string; abortSignal?: AbortSignal },
    ): Promise<{ approve: true } | { approve: false; reason: string }> => {
      if (terminal) {
        // grok doesn't follow my instructions
        const safeCwd = cwd === "null" ? null : cwd;
        const resolvedCwd = resolveCwd(safeCwd, baseDir);
        let userResponse: AskResponse | undefined;
        // Prompt only for potentially mutating commands when a toolExecutor is present
        if (toolExecutor && isMutatingCommand(command)) {
          // Display if autoAccept is false
          if (!toolExecutor.autoAccept(BashTool.name)) {
            terminal.writeln(
              `\n${style.blue.bold("●")} Proposing to execute command: ${style.cyan(command)} in ${style.cyan(resolvedCwd)}`,
            );
            terminal.lineBreak();
          }

          const ctx = {
            toolName: BashTool.name,
            toolCallId,
            message: "What would you like to do with this command execution?",
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
              throw new Error("Command execution aborted during user input");
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
            style.yellow(
              "✓ Auto-accept mode enabled for all command executions",
            ),
          );
          terminal.lineBreak();
        }

        if (userChoice === "reject") {
          terminal.lineBreak();

          const rejectionReason = reason || "No reason provided";
          return {
            approve: false,
            reason: `The user rejected this command execution. Reason: ${rejectionReason}`,
          };
        }
      }
      return {
        approve: true,
      };
    },
  };
};
