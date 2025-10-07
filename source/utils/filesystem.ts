import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export function toPath(urlOrPath: URL | string): string {
  return urlOrPath instanceof URL ? fileURLToPath(urlOrPath) : urlOrPath;
}

/**
 * Converts Windows backslashes to POSIX forward slashes.
 * Preserves UNC paths and extended-length paths.
 * @param inputPath - Path to convert
 * @returns Path with forward slashes
 */
export function slash(inputPath: string): string {
  const isExtendedLengthPath = inputPath.startsWith("\\\\?\\");
  const isUncPath = inputPath.startsWith("\\\\");

  if (isExtendedLengthPath || isUncPath) {
    return inputPath;
  }

  return inputPath.replace(/\\/g, "/");
}

/**
 * Checks if a path exists and is a directory.
 * @param filePath - Path to check (URL or string)
 * @returns Promise resolving to true if path is a directory
 * @throws TypeError if input is invalid
 */
export async function isDirectory(filePath: URL | string): Promise<boolean> {
  const resolvedPath = path.resolve(toPath(filePath));

  if (typeof resolvedPath !== "string" || !resolvedPath.trim()) {
    throw new TypeError(
      `Expected a non-empty string or URL, got ${typeof filePath}`,
    );
  }

  try {
    const stats = await fsPromises.stat(resolvedPath);
    return stats.isDirectory();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/**
 * Safely clears all contents of a directory.
 * @param directoryPath - Path to the directory to clear (URL or string)
 * @returns Promise that resolves when directory is cleared
 * @throws Error if directory cannot be cleared or if path is invalid/unsafe
 */
export async function clearDirectory(
  directoryPath: URL | string,
): Promise<void> {
  // Convert URL to path and resolve to absolute path
  const resolvedPath = path.resolve(toPath(directoryPath));

  // Input validation
  if (typeof resolvedPath !== "string" || !resolvedPath.trim()) {
    throw new TypeError("Directory path must be a non-empty string");
  }

  // Safety checks - prevent clearing root or dangerous paths
  const parsedPath = path.parse(resolvedPath);
  const isRoot = resolvedPath === parsedPath.root;
  const isCurrentDir =
    resolvedPath === "." || resolvedPath === path.resolve(".");

  if (isRoot || isCurrentDir) {
    throw new Error(`Refusing to clear dangerous path: ${resolvedPath}`);
  }

  try {
    // Check if directory exists and is accessible
    try {
      const stats = await fsPromises.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${resolvedPath}`);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        // Directory doesn't exist, nothing to clear
        return;
      }
      throw error;
    }

    // Read directory contents
    const entries = await fsPromises.readdir(resolvedPath, {
      withFileTypes: true,
    });

    // Delete all entries with concurrency control and proper error handling
    const maxConcurrent = 50; // Limit concurrent operations to avoid EMFILE
    const errors: Array<{ path: string; error: Error; op: string }> = [];

    // Process entries in batches to control concurrency
    for (let i = 0; i < entries.length; i += maxConcurrent) {
      const batch = entries.slice(i, i + maxConcurrent);

      const deletionPromises = batch.map(async (entry) => {
        const entryPath = path.join(resolvedPath, entry.name);
        const relativePath = path.relative(process.cwd(), entryPath);

        try {
          if (entry.isSymbolicLink()) {
            // Always unlink symlinks, don't recurse
            await fsPromises.unlink(entryPath);
          } else if (entry.isDirectory()) {
            // Recursively delete subdirectories
            await clearDirectory(entryPath);
            // Use rm instead of deprecated rmdir
            await fsPromises.rm(entryPath, { recursive: false });
          } else {
            // Delete files using rm for consistency
            await fsPromises.rm(entryPath, { force: false });
          }
        } catch (error) {
          const err = error as NodeJS.ErrnoException;
          errors.push({
            path: relativePath,
            error: err,
            op: entry.isDirectory() ? "rm" : "unlink",
          });
        }
      });

      await Promise.all(deletionPromises);
    }

    // If any deletions failed, throw aggregated error
    if (errors.length > 0) {
      const errorDetails = errors
        .map(({ path, error, op }) => {
          const errnoError = error as NodeJS.ErrnoException;
          return `${path} (${op}): ${error.message} (${errnoError.code || "UNKNOWN"})`;
        })
        .join("; ");
      throw new Error(
        `Failed to delete ${errors.length} entries: ${errorDetails}`,
        {
          cause: errors[0].error,
        },
      );
    }
  } catch (error) {
    const err = error as Error;
    throw new Error(
      `Failed to clear directory ${resolvedPath}: ${err.message}`,
      { cause: err },
    );
  }
}
