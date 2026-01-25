import path from "node:path";

/**
 * Converts an absolute path to a relative path for display purposes.
 * If the path is within the current working directory, returns the relative path.
 * Otherwise, returns the absolute path unchanged.
 *
 * @param absolutePath - The absolute path to convert
 * @param cwd - The current working directory (defaults to process.cwd())
 * @returns The display-ready path (relative if within cwd, absolute otherwise)
 */
export function toDisplayPath(
  absolutePath: string,
  cwd: string = process.cwd(),
): string {
  // If path is already relative, return as-is
  if (!path.isAbsolute(absolutePath)) {
    return absolutePath;
  }

  // Try to get relative path
  const relativePath = path.relative(cwd, absolutePath);

  // If relative path starts with '..', it means the path is outside cwd
  // Return absolute path in that case
  if (relativePath.startsWith("..")) {
    return absolutePath;
  }

  // If relative path is empty (path equals cwd), return '.'
  if (relativePath === "") {
    return ".";
  }

  // Return relative path
  return relativePath;
}
