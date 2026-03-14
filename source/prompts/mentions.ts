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

async function readFileEntry(
  fullPath: string,
  relativeFilePath: string,
  format: FormatType,
): Promise<string> {
  try {
    const fileContents = await fs.readFile(fullPath, "utf8");
    return formatFile(relativeFilePath, fileContents, format);
  } catch (error) {
    return `Error reading file ${relativeFilePath}: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

async function collectFiles(
  currentPath: string,
  format: FormatType,
  allContents: string[],
  relativePath = "",
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativeFilePath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, format, allContents, relativeFilePath);
    } else if (entry.isFile()) {
      allContents.push(await readFileEntry(fullPath, relativeFilePath, format));
    }
  }
}

async function readDirectoryRecursive(
  dirPath: string,
  format: FormatType,
): Promise<string> {
  const allContents: string[] = [];
  await collectFiles(dirPath, format, allContents);

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
  // Regex matches # followed by a file path:
  // - Can start with . (relative paths like ./file or .hidden)
  // - Can start with / (absolute paths)
  // - Can start with ~ (home directory)
  // - Can start with alphanumeric/underscore (simple filenames)
  // - Path continues with non-whitespace, non-# characters
  // - Does NOT match # followed by just digits (paste placeholder format like [Paste #1])
  // - Does NOT match # followed by digits and dots (version numbers like #1.2.3)
  // - Does NOT match issue references like #123
  const fileRegex =
    /(?<![a-zA-Z0-9_-])#(?![\d.]+(?:[\s,\]]|$))([./~]?[a-zA-Z0-9_][a-zA-Z0-9_./~-]*|[./~][a-zA-Z0-9_./~-]+)/g;

  // Collect all matches for files
  const fileMatches = Array.from(message.matchAll(fileRegex));

  const mentionProcessingPromises: Promise<string>[] = [];
  const matchStrings: string[] = [];

  // Process file references - collect promises
  for (const match of fileMatches) {
    const filePath = match[1];
    if (filePath) {
      const context = {
        model,
        baseDir,
        match: filePath,
      };
      mentionProcessingPromises.push(processFileCommand(context));
      matchStrings.push(match[0]); // Store the full match including #
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

  // Remove file references from message and add contents to context
  for (let i = 0; i < mentionResults.length; i++) {
    const fileContent = mentionResults[i];
    const matchString = matchStrings[i];

    // Add file content to context
    context.push(fileContent);

    // Remove the #filepath reference from the message
    processedMessage = processedMessage.replace(matchString, "");
  }

  // Clean up multiple spaces left by removals, but preserve newlines
  // First, normalize line endings to \n
  processedMessage = processedMessage
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  // Replace multiple spaces with a single space (but not newlines)
  processedMessage = processedMessage.replace(/[ \t]+/g, " ");
  // Trim whitespace from each line while preserving empty lines
  processedMessage = processedMessage
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  return {
    message: processedMessage,
    context,
  };
}
