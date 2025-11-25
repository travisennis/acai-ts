import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import { initExecutionEnvironment } from "../execution/index.ts";
import { logger } from "../logger.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { manageTokenLimit } from "../tokens/threshold.ts";
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
}: {
  baseDir: string;
  allowedDirs?: string[];
  tokenCounter: TokenCounter;
}) => {
  const execEnv = await initExecutionEnvironment();
  const projectConfig = await config.readProjectConfig();
  const accessibleLogPath = config.getAccessibleLogPath();
  const allowedPaths = new Set([
    ...(projectConfig.logs?.path ? [projectConfig.logs.path] : []),
    accessibleLogPath,
  ]);
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
        // Safety warning for potentially mutating commands
        const isMutating = isMutatingCommand(command);
        yield {
          name: BashTool.name,
          event: "tool-init",
          id: toolCallId,
          data: `${style.cyan(command)}${isMutating ? " *" : ""}`,
        };

        if (!isPathWithinAllowedDirs(resolvedCwd, allowedDirectories)) {
          const errorMsg = `Working directory must be within the allowed directories: ${allowedDirectories.join(", ")}`;
          yield {
            name: BashTool.name,
            event: "tool-error",
            id: toolCallId,
            data: errorMsg,
          };
          yield errorMsg;
          return;
        }

        const pathValidation = validatePaths(
          command,
          allowedDirectories,
          resolvedCwd,
          [...allowedPaths],
        );
        if (!pathValidation.isValid) {
          yield {
            name: BashTool.name,
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

        const result = await manageTokenLimit(
          output,
          tokenCounter,
          "Bash",
          "Adjust command to return more specific results",
        );

        yield {
          name: BashTool.name,
          event: "tool-completion",
          id: toolCallId,
          data: `${exitCode} (${result.tokenCount} tokens)`,
        };

        yield result.content;
      } catch (error) {
        logger.error(error, "Bash Tool Error:");
        yield {
          name: BashTool.name,
          event: "tool-error",
          id: toolCallId,
          data: (error as Error).message,
        };
        yield (error as Error).message;
      }
    },
  };
};
