import { execSync } from "node:child_process";
import { z } from "zod";
import { initExecutionEnvironment } from "../execution/index.ts";
import { logger } from "../logger.ts";
import style from "../terminal/style.ts";

import { resolveCwd, validatePaths } from "../utils/bash.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";

/**
 * Detects git commit commands with multi-line -m messages that will fail in shell.
 * Returns an error message if detected, or null if the command is safe.
 */
function detectMultilineGitCommit(command: string): string | null {
  const trimmed = command.trim();

  // Check if it's a git commit command
  if (!trimmed.startsWith("git commit") && !trimmed.startsWith("git ")) {
    return null;
  }

  // Look for -m flag with a message containing newlines
  // Match patterns like: git commit -m "message\nwith\nnewlines"
  // Using [\s\S] instead of [^] to match any character including newlines
  const messageMatch = trimmed.match(/-m\s+["']([\s\S]*?)["']/);
  if (!messageMatch) {
    return null;
  }

  const message = messageMatch[1];
  if (message.includes("\n")) {
    return `Multi-line commit messages with -m flag cause shell parsing errors. Instead:
1. Write the commit message to a temporary file (e.g., /tmp/acai/commit-msg.txt)
2. Use: git commit -F /tmp/acai/commit-msg.txt
3. Optionally remove the temp file after committing

Example:
  First, create the file with the commit message using the write_file tool.
  Then run: git commit -F /tmp/acai/commit-msg.txt`;
  }

  return null;
}

export const BashTool = {
  name: "Bash" as const,
};

const installedTools = getInstalledTools();

const toolDescription = `Execute commands in a shell. Commands can execute only within the allowed directories. Always use absolute paths.

Tools available:
${installedTools}`;

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

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
}: {
  baseDir: string;
  allowedDirs?: string[];
}) => {
  const execEnv = await initExecutionEnvironment({
    execution: {
      env: {
        // biome-ignore lint/style/useNamingConvention: environment variable
        TICKETS_DIR: `${process.cwd()}/.tickets`,
      },
    },
  });
  const allowedDirectories = allowedDirs ?? [baseDir];
  return {
    toolDef: {
      description: toolDescription,
      inputSchema,
    },
    display({ command }: BashInputSchema) {
      return `\n> ${style.cyan(command)}`;
    },
    async execute(
      { command, cwd, timeout, background }: BashInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("Command execution aborted");
      }

      // grok doesn't follow my instructions
      const safeCwd = cwd === "null" ? null : cwd;
      const resolvedCwd = resolveCwd(safeCwd, baseDir, allowedDirectories);
      const safeTimeout = timeout ?? DEFAULT_TIMEOUT;

      const pathValidation = validatePaths(
        command,
        allowedDirectories,
        resolvedCwd,
      );
      if (!pathValidation.isValid) {
        throw new Error(pathValidation.error ?? "Unknown error.");
      }

      // Check for multi-line git commit messages that will fail
      const multilineError = detectMultilineGitCommit(command);
      if (multilineError) {
        throw new Error(multilineError);
      }

      if (abortSignal?.aborted) {
        throw new Error("Command execution aborted before running the command");
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

        return `Background process started with PID: ${backgroundProcess.pid}`;
      }

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

      if (exitCode !== 0) {
        throw new Error(output);
      }

      return output;
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
