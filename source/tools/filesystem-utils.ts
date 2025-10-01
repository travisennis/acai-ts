import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TokenCounter } from "../tokens/counter.ts";

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

// Ensure path is within base directory (handles '.', relative paths, and symlinks)
export function isPathWithinBaseDir(
  requestedPath: string,
  baseDir: string,
): boolean {
  const baseAbs = path.resolve(baseDir);
  let baseReal = baseAbs;
  try {
    baseReal = realpathSync(baseAbs);
  } catch {
    // If baseDir doesn't exist, fall back to resolved path
  }

  const abs = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(baseReal, requestedPath);

  let target = abs;
  try {
    target = realpathSync(abs);
  } catch {
    // If target doesn't fully exist, validate against intended path
  }

  const rel = path.relative(baseReal, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Security utilities
export async function validatePath(
  requestedPath: string,
  allowedDirectory: string,
  options: { requireExistence?: boolean; abortSignal?: AbortSignal } = {},
): Promise<string> {
  const { requireExistence = true, abortSignal } = options;

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

  let validatedPath: string;

  // Try to resolve real path for existing targets to handle symlinks safely
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    if (!isWithinAllowed(normalizedReal)) {
      throw new Error(
        "Access denied - symlink target outside allowed directories",
      );
    }
    validatedPath = realPath;
  } catch (_error) {
    // For new files or paths where some directories don't exist yet:
    // Walk up to the nearest existing ancestor directory and validate it.
    let current = path.dirname(absolute);
    let foundValidAncestor = false;
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
        foundValidAncestor = true;
        break;
      } catch (_err) {
        // If we reached the filesystem root, break to fallback check
        const parent = path.dirname(current);
        if (parent === current) {
          break;
        }
        current = parent;
      }
    }
    if (!foundValidAncestor) {
      // Rely on intended path check
    }
    validatedPath = absolute;
  }

  // Now, if requireExistence, check if the path exists
  if (requireExistence) {
    if (abortSignal?.aborted) {
      throw new Error("Path validation aborted during existence check");
    }
    try {
      await fs.stat(validatedPath);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        throw new Error(
          `The specified path does not exist: ${requestedPath} (${validatedPath})`,
        );
      }
      throw error;
    }
  }

  return validatedPath;
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
