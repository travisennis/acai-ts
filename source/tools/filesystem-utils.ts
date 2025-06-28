import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createTwoFilesPatch } from "diff";
import ignore, { type Ignore } from "ignore";
import type { TokenCounter } from "../token-utils.ts";

// Normalize all paths consistently
export function normalizePath(p: string): string {
  return path.normalize(p);
}

// Handle path joining with working directory
export function joinWorkingDir(userPath: string, workingDir: string): string {
  if (path.isAbsolute(userPath)) {
    return path.normalize(userPath);
  }
  return path.normalize(path.join(workingDir, userPath));
}

export function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Security utilities
export async function validatePath(
  requestedPath: string,
  allowedDirectory: string,
): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = normalizedRequested.startsWith(allowedDirectory);
  if (!isAllowed) {
    throw new Error(
      `Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectory}`,
    );
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = normalizedReal.startsWith(allowedDirectory);
    if (!isRealPathAllowed) {
      throw new Error(
        "Access denied - symlink target outside allowed directories",
      );
    }
    return realPath;
  } catch (_error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = normalizedParent.startsWith(allowedDirectory);
      if (!isParentAllowed) {
        throw new Error(
          "Access denied - parent directory outside allowed directories",
        );
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function createUnifiedDiff(
  originalContent: string,
  newContent: string,
  filepath = "file",
): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);
  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    "original",
    "modified",
  );
}

export interface FileEdit {
  oldText: string;
  newText: string;
}

async function backupFile(filePath: string): Promise<void> {
  /**
   * Create a backup of a file before editing.
   */
  const backupPath = `${filePath}.backup`;
  try {
    const content = await fs.readFile(filePath, "utf8");
    await fs.writeFile(backupPath, content);
  } catch (error) {
    // If we can't create a backup, just log the error
    console.error(`Failed to create backup of ${filePath}: ${error}`);
  }
}

export async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun = false,
): Promise<string> {
  // Read file content literally
  const originalContent = await fs.readFile(filePath, "utf-8");

  if (edits.find((edit) => edit.oldText.length === 0)) {
    throw new Error(
      "Invalid oldText in edit. The value of oldText must be at least one character",
    );
  }

  // Apply edits sequentially
  let modifiedContent = originalContent;
  for (const edit of edits) {
    const { oldText, newText } = edit; // Use literal oldText and newText

    if (modifiedContent.includes(oldText)) {
      // Literal replacement of the first occurrence
      modifiedContent = modifiedContent.replace(oldText, newText);
    } else {
      // If literal match is not found, throw an error.
      // The previous complex fallback logic is removed to ensure literal matching.
      throw new Error(
        `Could not find literal match for edit:\n${edit.oldText}`,
      );
    }
  }

  // Create unified diff (createUnifiedDiff normalizes line endings internally for diffing)
  const diff = createUnifiedDiff(originalContent, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    // Create backup before writing changes
    await backupFile(filePath);
    // Write the modified content (which has literal newlines from newText, and preserves original newlines not part of oldText/newText)
    await fs.writeFile(filePath, modifiedContent, "utf-8");
  }

  return formattedDiff;
}

/**
 * Generates the indentation string for a given level in the directory tree.
 * @param level - The current level in the directory tree.
 * @param isLast - Indicates if the current item is the last in its parent directory.
 * @returns The indentation string for the current level.
 */
function getIndent(level: number, isLast: boolean): string {
  const indent = "│   ".repeat(level - 1);
  return level === 0 ? "" : `${indent}${isLast ? "└── " : "├── "}`;
}

/**
 * Recursively generates a string representation of a directory tree.
 * @param dirPath - The path of the directory to generate the tree for.
 * @param level - The current level in the directory tree (default: 1).
 * @returns A Promise that resolves to a string representation of the directory tree.
 * @throws Will log an error if there's an issue reading the directory.
 */
async function generateDirectoryTree(
  dirPath: string,
  ig: Ignore,
  level = 1,
): Promise<string> {
  try {
    const name = path.basename(dirPath);
    let output = `${getIndent(level, false)}${name}\n`;

    const items = await fs.readdir(dirPath);
    const filteredItems = ig.filter(items);

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i] ?? "";
      const itemPath = path.join(dirPath, item);
      const isLast = i === items.length - 1;
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        output += await generateDirectoryTree(itemPath, ig, level + 1);
      } else {
        output += `${getIndent(level + 1, isLast)}${item}\n`;
      }
    }
    return output;
  } catch (error) {
    console.error(`Error reading directory: ${dirPath}`, error);
    return `Error reading directory: ${dirPath}: ${(error as Error).message}`;
  }
}

/**
 * Generates a string representation of a directory tree starting from the given path.
 * @param dirPath - The path of the directory to generate the tree for.
 * @returns A Promise that resolves to a string representation of the directory tree.
 */
export async function directoryTree(dirPath: string): Promise<string> {
  let ig: Ignore;
  try {
    const ignoreFile = await fs.readFile(
      path.join(process.cwd(), ".gitignore"),
    );
    ig = ignore().add(ignoreFile.toString()).add(".git");
  } catch (_error) {
    // If .gitignore doesn't exist, create basic ignore with just .git
    ig = ignore().add(".git");
  }
  return (await generateDirectoryTree(dirPath, ig)).trim();
}

export async function readFileAndCountTokens(
  filePath: string,
  workingDir: string,
  allowedDirectory: string,
  tokenCounter: TokenCounter,
  maxTokens: number,
): Promise<{
  path: string;
  content: string | null;
  tokenCount: number;
  error: string | null;
}> {
  try {
    const validPath = await validatePath(
      joinWorkingDir(filePath, workingDir),
      allowedDirectory,
    );
    const content = await fs.readFile(validPath, "utf-8");
    let tokenCount = 0;
    try {
      tokenCount = tokenCounter.count(content);
    } catch (tokenError) {
      console.error("Error calculating token count:", tokenError);
      // Handle token calculation error if needed
    }

    const maxTokenMessage = `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Use readFile with startLine/lineCount or grepFiles for targeted access.`;

    const finalContent = tokenCount > maxTokens ? maxTokenMessage : content;
    const actualTokenCount = tokenCount > maxTokens ? 0 : tokenCount; // Don't count tokens for skipped files

    return {
      path: filePath,
      content: finalContent,
      tokenCount: actualTokenCount,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      path: filePath,
      content: null,
      tokenCount: 0,
      error: errorMessage,
    };
  }
}
