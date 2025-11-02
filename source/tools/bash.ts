import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import { initExecutionEnvironment } from "../execution/index.ts";
import { logger } from "../logger.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { resolveCwd, validatePaths } from "./bash-utils.ts";
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
}: {
  baseDir: string;
  allowedDirs?: string[];
  tokenCounter: TokenCounter;
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
          data: `Bash: ${exitCode} (${tokenCount} tokens)`,
        };

        yield finalResult;
      } catch (error) {
        logger.error(error, "Bash Tool Error:");
        const errorMsg = `Bash: ${(error as Error).message}`;
        yield { event: "tool-error", id: toolCallId, data: errorMsg };
        yield errorMsg;
      }
    },
  };
};
