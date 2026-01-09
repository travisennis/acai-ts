import fs from "node:fs/promises";
import path from "node:path";

export async function validateDirectory(dirPath: string): Promise<boolean> {
  try {
    const resolvedPath = path.resolve(dirPath);
    const stats = await fs.stat(resolvedPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function resolveDirectoryPath(dirPath: string): string {
  return path.resolve(dirPath);
}
