import fs from "node:fs/promises";
import path from "node:path";
import { isString } from "@travisennis/stdlib/typeguards";
import { initExecutionEnvironment } from "./execution/index.ts";
import type { FormatType } from "./formatting.ts";
import { formatFile, formatUrl } from "./formatting.ts";
import type { ModelMetadata } from "./models/providers.ts";
import type { ContextItem } from "./prompts/manager.ts";
import { type ReadUrlResult, readUrl } from "./tools/web-fetch.ts";

class ShellCommandError extends Error {
  public readonly command: string;
  public readonly exitCode?: number;
  public readonly output?: string;

  constructor(
    message: string,
    command: string,
    exitCode?: number,
    output?: string,
  ) {
    super(message);
    this.name = "ShellCommandError";
    this.command = command;
    this.exitCode = exitCode;
    this.output = output;
  }
}

export class PromptError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = "PromptError";
  }
}

interface CommandContext {
  model: ModelMetadata;
  baseDir: string;
  match: string;
}

// Helper function to recursively read all files in a directory
async function readDirectoryRecursive(
  dirPath: string,
  format: FormatType,
): Promise<string> {
  const allContents: string[] = [];

  async function readDir(
    currentPath: string,
    relativePath = "",
  ): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativeFilePath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        await readDir(fullPath, relativeFilePath);
      } else if (entry.isFile()) {
        try {
          const fileContents = await fs.readFile(fullPath, "utf8");
          allContents.push(formatFile(relativeFilePath, fileContents, format));
        } catch (error) {
          allContents.push(
            `Error reading file ${relativeFilePath}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }
    }
  }

  await readDir(dirPath);

  if (allContents.length === 0) {
    return `Directory ${path.basename(dirPath)} is empty or contains no readable files.`;
  }

  return allContents.join("\n\n");
}

// Returns the formatted string or an error message string
async function processFileCommand(context: CommandContext): Promise<string> {
  const { baseDir, match } = context;
  const filePath = match.trim();
  const format = context.model.promptFormat;

  try {
    // Resolve paths to absolute to prevent traversal issues
    const resolvedBaseDir = path.resolve(baseDir);
    const resolvedFilePath = path.resolve(resolvedBaseDir, filePath);

    // Security Check: Ensure the resolved path is still within the base directory
    if (!resolvedFilePath.startsWith(resolvedBaseDir + path.sep)) {
      return `Error: Access denied. Attempted to read file outside the allowed directory: ${filePath}`;
    }

    // Check if path exists
    const stats = await fs.stat(resolvedFilePath);

    // If it's a directory, read all files recursively
    if (stats.isDirectory()) {
      return await readDirectoryRecursive(resolvedFilePath, format);
    }

    // If it's a file, process as before
    if (stats.isFile()) {
      const fileContents = await fs.readFile(resolvedFilePath, "utf8");
      return formatFile(filePath, fileContents, format);
    }

    return `Error: ${filePath} is neither a regular file nor directory.`;
  } catch (error) {
    // Handle both ENOENT (file not found) and permission errors
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "ENOENT") {
        return `Error: File or directory not found: ${filePath}\nPlease check that the path is correct and exists.`;
      }
      if (error.code === "EACCES") {
        return `Error: Permission denied accessing: ${filePath}`;
      }
    }
    if (error instanceof Error) {
      return `Error accessing ${filePath}: ${error.message}`;
    }
    // Fallback for unknown error types
    return `Error accessing ${filePath}: An unknown error occurred.`;
  }
}

async function processShellCommand(command: string): Promise<string> {
  try {
    const execEnv = await initExecutionEnvironment();
    const { output, exitCode } = await execEnv.executeCommand(command, {
      throwOnError: true,
    });
    if (exitCode === 0) {
      return output;
    }
    throw new ShellCommandError(
      `Command failed with exit code ${exitCode}`,
      command,
      exitCode,
      output,
    );
  } catch (error) {
    if (error instanceof ShellCommandError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new ShellCommandError(
        `Command execution failed: ${error.message}`,
        command,
        undefined,
        undefined,
      );
    }
    throw new ShellCommandError(
      "Command execution failed with unknown error",
      command,
      undefined,
      undefined,
    );
  }
}

// Returns the formatted string or an error message string
async function processUrlCommand(
  context: CommandContext,
): Promise<ReadUrlResult & { source: string }> {
  const { match } = context;
  const urlPath = match;
  try {
    return Object.assign(await readUrl(urlPath), { source: urlPath });
  } catch (error) {
    if (error instanceof Error) {
      return {
        contentType: "text/plain",
        data: `Url: ${urlPath} Status: Error fetching URL: ${error.message}`,
        source: urlPath,
      };
    }
    // Fallback for unknown error types
    return {
      contentType: "text/plain",
      data: `Url: ${urlPath} Status: Error fetching URL: An unknown error occurred.`,
      source: urlPath,
    };
  }
}

export async function processPrompt(
  message: string,
  { baseDir, model }: { baseDir: string; model: ModelMetadata },
): Promise<{ message: string; context: ContextItem[] }> {
  const fileRegex = /@([^\s@]+(?:\.[\w\d]+))/g;
  const urlRegex = /@(https?:\/\/[^\s]+)/g;
  const shellRegex = /!`([^`]+)`/g;

  // Collect all matches for files and urls
  const fileMatches = Array.from(message.matchAll(fileRegex));
  const urlMatches = Array.from(message.matchAll(urlRegex));
  const shellMatches = Array.from(message.matchAll(shellRegex));

  const mentionProcessingPromises: Promise<
    string | (ReadUrlResult & { source: string })
  >[] = [];

  // Process file references - collect promises
  for (const match of fileMatches) {
    const firstMatch = match[1];
    if (firstMatch) {
      const context = {
        model,
        baseDir,
        match: firstMatch,
      };
      mentionProcessingPromises.push(processFileCommand(context));
    }
  }

  // Process url references - collect promises
  for (const match of urlMatches) {
    const firstMatch = match[1];
    if (firstMatch) {
      const context = {
        model,
        baseDir, // baseDir is not used by processUrlCommand but kept for consistency
        match: firstMatch,
      };
      mentionProcessingPromises.push(processUrlCommand(context));
    }
  }

  let processedMessage = message;
  // Process shell commands
  for (const match of shellMatches) {
    const command = match[1];
    if (command) {
      try {
        const output = await processShellCommand(command);
        processedMessage = processedMessage.replace(match[0], output);
      } catch (error) {
        if (error instanceof ShellCommandError) {
          // Wrap shell command errors in PromptError
          throw new PromptError(
            `Shell command failed: ${error.message}`,
            error,
          );
        }
        // For other errors, wrap them in PromptError
        throw new PromptError(
          `Unexpected error executing command: ${error instanceof Error ? error.message : "Unknown error"}`,
          error instanceof Error ? error : undefined,
        );
      }
    }
  }

  // Wait for all mentions to be processed
  const mentionResults = await Promise.all(mentionProcessingPromises);

  const context: ContextItem[] = [];

  for (const mention of mentionResults) {
    if (isString(mention)) {
      context.push(mention);
    } else if (mention.data.startsWith("data")) {
      context.push({
        type: "image",
        mediaType: mention.contentType,
        image: mention.data,
      });
    } else {
      context.push(
        formatUrl(mention.source, mention.data.trim(), model.promptFormat),
      );
    }
  }

  return {
    message: processedMessage,
    context,
  };
}
