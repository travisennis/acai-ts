import type { Dirent } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

// Cache for directory listings to improve performance
export class DirectoryCache {
  private cache = new Map<string, { entries: Dirent[]; timestamp: number }>();
  private ttl = 3000; // 3 seconds

  async get(dir: string): Promise<Dirent[] | null> {
    const cached = this.cache.get(dir);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.entries;
    }
    return null;
  }

  set(dir: string, entries: Dirent[]): void {
    this.cache.set(dir, { entries, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const directoryCache = new DirectoryCache();

// Helper function to get directory entries with caching and timeout
export async function getDirectoryEntries(dirs: string[]): Promise<Dirent[]> {
  const results: Dirent[] = [];
  for (const dir of dirs) {
    const cached = await directoryCache.get(dir);
    if (cached) {
      results.push(...cached);
      continue;
    }

    try {
      // Add timeout to prevent hanging on slow file systems
      const entries = await Promise.race([
        readdir(dir, { withFileTypes: true }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Directory read timeout")), 2000),
        ),
      ]);
      directoryCache.set(dir, entries);
      results.push(...entries);
    } catch (_e) {
      // ignore
    }
  }
  return results;
}

export async function isPathWithinAllowedDirs(
  requestedPath: string,
  allowedDirs: string[],
): Promise<boolean> {
  for (const allowedDir of allowedDirs) {
    // Resolve both paths to handle relative paths and symlinks
    const absRequested = resolve(requestedPath);
    const absAllowed = resolve(allowedDir);

    let target = absRequested;
    try {
      // Try to resolve symlinks for the target path
      target = await realpath(absRequested);
    } catch {
      // If target doesn't exist, use the intended path
    }

    const rel = relative(absAllowed, target);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
      return true;
    }
  }
  return false;
}

export function extractPathPrefix(
  text: string,
  forceExtract = false,
): string | null {
  // Match paths - more conservative approach to avoid matching already completed paths
  // This regex captures:
  // - Paths starting from beginning of line or after space
  // - Optional ./ or ../ or ~/ prefix
  // - The path itself (must contain at least one / or start with ./ or ../ or ~/)
  const matches = text.match(
    /(?:^|\s)((?:\/{1,2}|\.{1,2}\/|~\/)?(?:[^\s]*\/)*[^\s/]*)$/,
  );
  if (!matches) {
    // If forced extraction and no matches, return empty string to trigger from current dir
    return forceExtract ? "" : null;
  }

  const pathPrefix = matches[1] || "";

  // For forced extraction (Tab key), always return something
  if (forceExtract) {
    // If we're not in a clear path context and we're at the end of a word,
    // return empty string to complete from current directory
    if (
      !pathPrefix.includes("/") &&
      !pathPrefix.endsWith("/") &&
      !pathPrefix.startsWith(".") &&
      !pathPrefix.startsWith("~/")
    ) {
      // Only return empty string if we're at the beginning or after space
      // This prevents completing "source" as empty string
      if (text === "" || text.endsWith(" ")) {
        return "";
      }
    }
    return pathPrefix;
  }

  // For natural triggers, be more conservative:
  // Only trigger if we have a clear path indicator
  const hasPathIndicator =
    pathPrefix.includes("/") ||
    pathPrefix.endsWith("/") ||
    pathPrefix.startsWith(".") ||
    pathPrefix.startsWith("~/");

  if (!hasPathIndicator) {
    return null;
  }

  // Additional check: don't trigger if the path looks like it's already completed
  // (i.e., doesn't end with a partial filename)
  // Only apply this check for paths that don't have clear path indicators
  // and look like single directory names (no path separators)
  if (
    !pathPrefix.includes("/") &&
    !pathPrefix.includes(".") &&
    !pathPrefix.startsWith("./") &&
    !pathPrefix.startsWith("../") &&
    !pathPrefix.startsWith("~/") &&
    pathPrefix.length > 3
  ) {
    // This might be a completed directory name, not a partial path
    return null;
  }

  return pathPrefix;
}
