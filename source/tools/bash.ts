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
      "Working directory file path (default: project root). Must be within the project directory. Required but nullable.",
    ),
  timeout: z.coerce
    .number()
    .nullable()
    .describe(
      `Command execution timeout in milliseconds. Required but nullable. If null, the default value is ${DEFAULT_TIMEOUT}ms`,
    ),
  background: z
    .boolean()
    .optional()
    .describe(
      "Run command in background. If true, command will run until program exit.",
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
      { command, cwd, timeout, background }: BashInputSchema,
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
          data: `${style.cyan(command)}`,
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

        // Handle background execution
        if (background) {
          // Strip any existing & from command to avoid double backgrounding
          let processedCommand = command.trim();
          if (processedCommand.endsWith("&")) {
            logger.warn(
              `Stripping '&' from command since background=true: ${command}`,
            );
            processedCommand = processedCommand.slice(0, -1).trim();
          }

          const backgroundProcess = execEnv.executeCommandInBackground(
            processedCommand,
            {
              cwd: resolvedCwd,
              abortSignal,
              onOutput: (output) => {
                logger.debug({ output }, "Background command output:");
              },
              onError: (error) => {
                logger.debug({ error }, "Background command error:");
              },
              onExit: (code) => {
                logger.debug(`Background command exited with code ${code}`);
              },
            },
          );

          yield {
            name: BashTool.name,
            event: "tool-completion",
            id: toolCallId,
            data: `Background process started with PID: ${backgroundProcess.pid}`,
          };

          yield `Background process started with PID: ${backgroundProcess.pid}`;
        } else {
          // Handle regular synchronous execution
          // Strip & if present to ensure synchronous behavior
          let processedCommand = command.trim();
          if (processedCommand.endsWith("&")) {
            logger.warn(
              `Stripping '&' from command since background=false: ${command}`,
            );
            processedCommand = processedCommand.slice(0, -1).trim();
          }

          const { output, exitCode } = await execEnv.executeCommand(
            processedCommand,
            {
              cwd: resolvedCwd,
              timeout: safeTimeout,
              abortSignal,
              preserveOutputOnError: true,
              captureStderr: true,
              throwOnError: false,
            },
          );

          const result = await manageTokenLimit(
            output,
            tokenCounter,
            "Bash",
            "Adjust command to return more specific results",
          );

          const statusText = exitCode === 0 ? "success" : "error";
          yield {
            name: BashTool.name,
            event: "tool-completion",
            id: toolCallId,
            data: `${statusText}${isMutating ? " *" : ""} (${result.tokenCount} tokens)`,
          };

          yield result.content;
        }
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
