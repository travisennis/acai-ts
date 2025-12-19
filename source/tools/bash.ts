import { execSync } from "node:child_process";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { initExecutionEnvironment } from "../execution/index.ts";
import { logger } from "../logger.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import {
  manageTokenLimit,
  TokenLimitExceededError,
} from "../tokens/threshold.ts";
import { isMutatingCommand, resolveCwd, validatePaths } from "../utils/bash.ts";
import type { ToolResult } from "./types.ts";

export const BashTool = {
  name: "bash" as const,
};

const installedTools = getInstalledTools();

const toolDescription = `Execute commands in a shell. Commands can execute only within the allowed directories. Always use absolute paths.

Tools available:
${installedTools}`;

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

// Helper function to convert string "null" to actual null
const convertNullString = (value: unknown): unknown | null => {
  if (typeof value === "string" && value.toLowerCase() === "null") {
    return null;
  }
  return value;
};

const inputSchema = z.object({
  command: z.string().describe("Full CLI command to execute."),
  cwd: z
    .preprocess((val) => convertNullString(val), z.string().nullable())
    .describe(
      "Working directory file path (default: project root). Must be within the project directory. Required but nullable.",
    ),
  timeout: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
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
  const allowedDirectories = allowedDirs ?? [baseDir];
  return {
    toolDef: {
      description: toolDescription,
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
        const resolvedCwd = resolveCwd(safeCwd, baseDir, allowedDirectories);
        const safeTimeout = timeout ?? DEFAULT_TIMEOUT;
        // Safety warning for potentially mutating commands
        const isMutating = isMutatingCommand(command);
        yield {
          name: BashTool.name,
          event: "tool-init",
          id: toolCallId,
          data: `${style.cyan(command)}`,
        };

        const pathValidation = validatePaths(
          command,
          allowedDirectories,
          resolvedCwd,
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

          // Fix rg commands that don't have an explicit path
          processedCommand = fixRgCommand(processedCommand);

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

          // Fix rg commands that don't have an explicit path
          // rg hangs when stdin is a socket and no path is given
          processedCommand = fixRgCommand(processedCommand);

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

          try {
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
          } catch (error) {
            if (error instanceof TokenLimitExceededError) {
              yield {
                name: BashTool.name,
                event: "tool-error",
                id: toolCallId,
                data: error.message,
              };
              yield error.message;
              return;
            }
            throw error;
          }
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

function getInstalledTools() {
  // Check for required bash tools
  const tools = [
    {
      name: "git",
      command: "git --version",
      description:
        "Version control system - used for cloning repositories, checking out branches, committing changes, viewing history, and managing code versions",
    },
    {
      name: "gh",
      command: "gh --version",
      description:
        "GitHub CLI - used for creating pull requests, managing issues, interacting with GitHub API, and automating GitHub workflows",
    },
    {
      name: "rg",
      command: "rg --version",
      description:
        "ripgrep - fast text search tool for searching code patterns, file contents, and regular expressions across the codebase (use this instead of grep)",
    },
    {
      name: "fd",
      command: "fd --version",
      description:
        "Fast file finder - alternative to find command, used for finding files by name, pattern, or type with intuitive syntax (use this instead of find)",
    },
    {
      name: "ast-grep",
      command: "ast-grep --version",
      description:
        "AST-based code search - used for structural code search, refactoring, finding patterns in abstract syntax trees, and code transformations",
    },
    {
      name: "jq",
      command: "jq --version",
      description:
        "JSON processor - used for parsing, filtering, and manipulating JSON output from APIs, commands, and configuration files",
    },
    {
      name: "yq",
      command: "yq --version",
      description:
        "YAML processor - used for parsing and manipulating YAML files (configs, CI/CD pipelines, Kubernetes manifests) with jq-like syntax",
    },
  ];

  const toolStatus = tools
    .map((tool) => {
      let status = false;
      try {
        execSync(tool.command, { stdio: "ignore", timeout: 5000 });
        status = true;
      } catch (_error) {
        // Ignore error, tool is not installed
      }
      return { name: tool.name, description: tool.description, status };
    })
    .filter((tool) => tool.status)
    .map((tool) => `- **${tool.name}**: ${tool.description}`)
    .join("\n");

  return toolStatus;
}

/**
 * Fix rg commands that don't have an explicit path
 * rg hangs when stdin is a socket and no path is given
 * See: https://github.com/BurntSushi/ripgrep/discussions/2047
 */
function fixRgCommand(command: string): string {
  const trimmed = command.trim();

  // Check if command starts with rg
  if (!trimmed.startsWith("rg ") && !trimmed.startsWith("rg\\")) {
    return command;
  }

  // Check if command already has stdin redirection or piping
  // Don't modify commands like: cat file.txt | rg pattern
  // or rg pattern < input.txt
  if (trimmed.includes("|") || trimmed.includes("<") || trimmed.includes(">")) {
    return command;
  }

  // Simple heuristic: if last token starts with -, add .
  // This handles cases like: rg -l pattern --type ts --type js
  const tokens = trimmed.split(/\\s+/);
  const lastToken = tokens[tokens.length - 1];

  if (lastToken?.startsWith("-")) {
    // Command ends with an option, need to add path
    logger.debug(`Adding '.' to rg command: ${command}`);
    return `${command} .`;
  }

  // Last token doesn't start with -, could be a path or pattern
  if (lastToken) {
    // If it's ., ./, /, or contains /, assume it's a path
    if (
      lastToken === "." ||
      lastToken.startsWith("./") ||
      lastToken.startsWith("/") ||
      lastToken.includes("/") ||
      lastToken === ".."
    ) {
      // Already has a path
      return command;
    }
    // Check if it's a simple pattern (no special chars that would make it a path)
    // If it's just alphanumeric with maybe some regex chars, it's probably a pattern
    // Common pattern chars: ., *, +, ?, [, ], ^, $, (, ), |, \\
    // But we want to be conservative - if it looks like a filename without path, add .
    if (!lastToken.includes("/") && !lastToken.includes("*")) {
      // Doesn't look like a path with glob or directory, likely a pattern
      // Need to add path
      logger.debug(`Adding '.' to rg command: ${command}`);
      return `${command} .`;
    }
    // Complex case with * or other chars, could be a glob pattern
    // Default to adding . to be safe
  }

  // No last token or complex case, add . to be safe
  logger.debug(`Adding '.' to rg command: ${command}`);
  return `${command} .`;
}
