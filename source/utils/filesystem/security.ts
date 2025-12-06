import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectConfig } from "../../config.ts";

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
function isPathWithinBaseDir(requestedPath: string, baseDir: string): boolean {
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

// Check if path is within any of the allowed directories
export function isPathWithinAllowedDirs(
  requestedPath: string,
  allowedDirs: string[],
): boolean {
  return allowedDirs.some((allowedDir) =>
    isPathWithinBaseDir(requestedPath, allowedDir),
  );
}

// Security utilities
export async function validatePath(
  requestedPath: string,
  allowedDirectory: string | string[],
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

  // Handle both single directory and array of directories
  const allowedDirectories = Array.isArray(allowedDirectory)
    ? allowedDirectory
    : [allowedDirectory];

  // Resolve and normalize all allowed directories
  const normalizedAllowedDirs = await Promise.all(
    allowedDirectories.map(async (dir) => {
      let normalizedDir = normalizePath(path.resolve(dir));
      // Try to resolve real path for allowedDirectory when it exists to handle symlinked roots
      try {
        const stats = await fs.stat(normalizedDir);
        if (stats.isDirectory()) {
          const allowedReal = await fs.realpath(normalizedDir);
          normalizedDir = normalizePath(allowedReal);
        }
      } catch (_err) {
        // If allowedDirectory doesn't exist, keep normalizedDir as-is
      }
      return normalizedDir;
    }),
  );

  // Helper to check if a path is within any allowed directory using path.relative
  const isWithinAllowed = (targetPath: string): boolean => {
    return normalizedAllowedDirs.some((normalizedAllowed) => {
      const rel = path.relative(normalizedAllowed, targetPath);
      // Allow the allowed directory itself (rel === "") and any descendant paths
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    });
  };

  // Check intended path is within any allowed directory
  if (!isWithinAllowed(normalizedRequested)) {
    throw new Error(
      `Access denied - path outside allowed directories: ${absolute} not in any of ${allowedDirectories.join(", ")}`,
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

// Check if a file is read-only based on config
function isFileReadOnly(
  filePath: string,
  readOnlyFiles: string[],
  workingDir: string,
): boolean {
  if (readOnlyFiles.length === 0) {
    return false;
  }

  const normalizedFilePath = normalizePath(path.resolve(workingDir, filePath));

  return readOnlyFiles.some((readOnlyPattern) => {
    // Handle absolute paths
    if (path.isAbsolute(readOnlyPattern)) {
      const normalizedPattern = normalizePath(path.resolve(readOnlyPattern));
      return normalizedFilePath === normalizedPattern;
    }

    // Handle relative paths (relative to working directory)
    const normalizedRelativePattern = normalizePath(
      path.resolve(workingDir, readOnlyPattern),
    );
    return normalizedFilePath === normalizedRelativePattern;
  });
}

// Validate that a file is not read-only before modification
export function validateFileNotReadOnly(
  filePath: string,
  config: ProjectConfig,
  workingDir: string,
): void {
  if (isFileReadOnly(filePath, config.readOnlyFiles, workingDir)) {
    throw new Error(`File is read-only and cannot be modified: ${filePath}`);
  }
}
