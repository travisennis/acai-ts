import fs from "node:fs/promises";
import path from "node:path";

/**
 * Safely clears all contents of a directory
 * @param directoryPath - Path to the directory to clear
 * @returns Promise that resolves when directory is cleared
 * @throws Error if directory cannot be cleared
 */
export async function clearDirectory(directoryPath: string): Promise<void> {
  try {
    // Check if directory exists
    try {
      const stats = await fs.stat(directoryPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${directoryPath}`);
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
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    // Delete all entries
    const deletionPromises = entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively delete subdirectories
        await clearDirectory(entryPath);
        await fs.rmdir(entryPath);
      } else {
        // Delete files
        await fs.unlink(entryPath);
      }
    });

    // Wait for all deletions to complete
    await Promise.allSettled(deletionPromises);

    // Verify directory is empty
    const remainingEntries = await fs.readdir(directoryPath);
    if (remainingEntries.length > 0) {
      throw new Error(
        `Failed to clear directory completely. Remaining entries: ${remainingEntries.join(", ")}`,
      );
    }
  } catch (error) {
    const err = error as Error;
    throw new Error(
      `Failed to clear directory ${directoryPath}: ${err.message}`,
    );
  }
}
