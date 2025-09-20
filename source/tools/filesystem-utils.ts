import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createTwoFilesPatch } from "diff";
import ignore, { type Ignore } from "ignore";
import type { TokenCounter } from "../token-utils.ts";

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p);
}

// Handle path joining with working directory
export function joinWorkingDir(userPath: string, workingDir: string): string {
  if (path.isAbsolute(userPath)) {
    return path.normalize(userPath);
  }
  return path.normalize(path.join(workingDir, userPath));
}

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Security utilities
export async function validatePath(
  requestedPath: string,
  allowedDirectory: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new Error("Path validation aborted");
  }
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
  const normalizedRequested = normalizePath(absolute);
  let normalizedAllowed = normalizePath(path.resolve(allowedDirectory));
  // Try to resolve real path for allowedDirectory when it exists to handle symlinked roots
  try {
    const stats = await fs.stat(normalizedAllowed);
    if (stats.isDirectory()) {
      const allowedReal = await fs.realpath(normalizedAllowed);
      normalizedAllowed = normalizePath(allowedReal);
    }
  } catch (_err) {
    // If allowedDirectory doesn't exist, keep normalizedAllowed as-is
  }

  // Helper to check if a path is within the allowed directory using path.relative
  const isWithinAllowed = (targetPath: string): boolean => {
    const rel = path.relative(normalizedAllowed, targetPath);
    // Allow the allowed directory itself (rel === "") and any descendant paths
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };

  // Check intended path is within allowed directory
  if (!isWithinAllowed(normalizedRequested)) {
    throw new Error(
      `Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectory}`,
    );
  }

  // Try to resolve real path for existing targets to handle symlinks safely
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    if (!isWithinAllowed(normalizedReal)) {
      throw new Error(
        "Access denied - symlink target outside allowed directories",
      );
    }
    return realPath;
  } catch (_error) {
    // For new files or paths where some directories don't exist yet:
    // Walk up to the nearest existing ancestor directory and validate it.
    let current = path.dirname(absolute);
    while (true) {
      try {
        const stat = await fs.stat(current);
        if (!stat.isDirectory()) {
          throw new Error(
            `Nearest existing ancestor is not a directory: ${current}`,
          );
        }
        const realAncestor = await fs.realpath(current);
        const normalizedAncestor = normalizePath(realAncestor);
        if (!isWithinAllowed(normalizedAncestor)) {
          throw new Error(
            "Access denied - ancestor directory resolves outside allowed directories",
          );
        }
        // Ancestor is within allowed; allow creation below it.
        return absolute;
      } catch (_err) {
        // If we reached the filesystem root, break to fallback check
        const parent = path.dirname(current);
        if (parent === current) {
          // As a final check, rely on intended path check which we already did
          return absolute;
        }
        current = parent;
      }
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

interface FileEdit {
  oldText: string;
  newText: string;
}

export async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun = false,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new Error("File edit operation aborted");
  }
  // Read file content literally with signal
  const originalContent = await fs.readFile(filePath, {
    encoding: "utf-8",
    signal: abortSignal,
  });

  if (edits.find((edit) => edit.oldText.length === 0)) {
    throw new Error(
      "Invalid oldText in edit. The value of oldText must be at least one character",
    );
  }

  // Apply edits sequentially
  let modifiedContent = originalContent;
  for (const edit of edits) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted during processing");
    }
    const { oldText, newText } = edit; // Use literal oldText and newText

    const normalizedContent = normalizeLineEndings(modifiedContent);
    const normalizedOldText = normalizeLineEndings(oldText);
    if (normalizedContent.includes(normalizedOldText)) {
      modifiedContent = normalizedContent.replace(normalizedOldText, newText);
    } else {
      // If literal match is not found, throw an error.
      // The previous complex fallback logic is removed to ensure literal matching.
      throw new Error("Could not find literal match for old text.");
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
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted before writing");
    }
    // Write the modified content with signal
    await fs.writeFile(filePath, modifiedContent, {
      encoding: "utf-8",
      signal: abortSignal,
    });
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
  const name = path.basename(dirPath);
  let output = `${getIndent(level, false)}${name}\n`;

  const items = await fs.readdir(dirPath);
  const filteredItems = ig.filter(items);

  for (let i = 0; i < filteredItems.length; i++) {
    const item = filteredItems[i] ?? "";
    const itemPath = path.join(dirPath, item);
    const isLast = i === filteredItems.length - 1;
    const stats = await fs.stat(itemPath);

    if (stats.isDirectory()) {
      output += await generateDirectoryTree(itemPath, ig, level + 1);
    } else {
      output += `${getIndent(level + 1, isLast)}${item}\n`;
    }
  }
  return output;
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
