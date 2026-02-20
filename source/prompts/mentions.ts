import fs from "node:fs/promises";
import path from "node:path";
import type { ModelMetadata } from "../models/providers.ts";
import type { FormatType } from "../utils/formatting.ts";
import { formatFile } from "../utils/formatting.ts";
import type { ContextItem } from "./manager.ts";

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

export async function processPrompt(
  message: string,
  {
    baseDir,
    model,
    pasteStore,
  }: {
    baseDir: string;
    model: ModelMetadata;
    pasteStore?: Map<number, string>;
  },
): Promise<{ message: string; context: ContextItem[] }> {
  const fileRegex =
    /(?<![a-zA-Z0-9_-])#([a-zA-Z_][^\s#]*?(?:\.[a-zA-Z0-9]+)?)(?![^\s#]*#[\d.]+)/g;

  // Collect all matches for files
  const fileMatches = Array.from(message.matchAll(fileRegex));

  const mentionProcessingPromises: Promise<string>[] = [];

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

  let processedMessage = message;

  // Process paste placeholders
  if (pasteStore && pasteStore.size > 0) {
    const pasteRegex = /\[Paste #(\d+), (\d+) characters\]/g;
    let match: RegExpExecArray | null = pasteRegex.exec(processedMessage);

    while (match !== null) {
      const pasteId = Number.parseInt(match[1], 10);
      const pasteContent = pasteStore.get(pasteId);

      if (pasteContent) {
        processedMessage = processedMessage.replace(match[0], pasteContent);
        // Reset regex lastIndex since we modified the string
        pasteRegex.lastIndex = 0;
      }

      match = pasteRegex.exec(processedMessage);
    }
  }

  // Wait for all mentions to be processed
  const mentionResults = await Promise.all(mentionProcessingPromises);

  const context: ContextItem[] = [];

  for (const mention of mentionResults) {
    context.push(mention);
  }

  return {
    message: processedMessage,
    context,
  };
}
