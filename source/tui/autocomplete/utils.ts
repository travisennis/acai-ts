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

// Extended Dirent with parent path for easier processing
export interface DirentWithPath extends Dirent {
  parentPath: string;
}

// Helper function to get directory entries with caching and timeout
export async function getDirectoryEntries(
  dirs: string[],
): Promise<DirentWithPath[]> {
  const results: DirentWithPath[] = [];
  for (const dir of dirs) {
    const cached = await directoryCache.get(dir);
    if (cached) {
      for (const entry of cached) {
        results.push(Object.assign(entry, { parentPath: dir }));
      }
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
      for (const entry of entries) {
        results.push(Object.assign(entry, { parentPath: dir }));
      }
    } catch (_e) {
      // ignore
    }
  }
  return results;
}

// Cache for resolved allowed directories to avoid repeated realpath calls
const resolvedAllowedDirsCache = new Map<string, string>();

async function getResolvedPath(path: string): Promise<string> {
  const cached = resolvedAllowedDirsCache.get(path);
  if (cached !== undefined) {
    return cached;
  }

  const absPath = resolve(path);
  let resolved = absPath;
  try {
    resolved = await realpath(absPath);
  } catch {
    // If path doesn't exist, use the resolved absolute path
  }

  // Cache with a size limit
  if (resolvedAllowedDirsCache.size > 500) {
    const firstKey = resolvedAllowedDirsCache.keys().next().value;
    if (firstKey !== undefined) {
      resolvedAllowedDirsCache.delete(firstKey);
    }
  }
  resolvedAllowedDirsCache.set(path, resolved);
  return resolved;
}

export async function isPathWithinAllowedDirs(
  requestedPath: string,
  allowedDirs: string[],
): Promise<boolean> {
  const target = await getResolvedPath(requestedPath);

  for (const allowedDir of allowedDirs) {
    const absAllowed = await getResolvedPath(allowedDir);
    const rel = relative(absAllowed, target);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
      return true;
    }
  }
  return false;
}

function hasPathIndicator(pathPrefix: string): boolean {
  return (
    pathPrefix.includes("/") ||
    pathPrefix.endsWith("/") ||
    pathPrefix.startsWith(".") ||
    pathPrefix.startsWith("~/")
  );
}

function isPartialPath(pathPrefix: string): boolean {
  return (
    !pathPrefix.includes("/") &&
    !pathPrefix.includes(".") &&
    !pathPrefix.startsWith("./") &&
    !pathPrefix.startsWith("../") &&
    !pathPrefix.startsWith("~/") &&
    pathPrefix.length > 3
  );
}

function shouldReturnEmptyForForceExtract(
  pathPrefix: string,
  text: string,
): boolean {
  return (
    !pathPrefix.includes("/") &&
    !pathPrefix.endsWith("/") &&
    !pathPrefix.startsWith(".") &&
    !pathPrefix.startsWith("~/") &&
    (text === "" || text.endsWith(" "))
  );
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
    if (shouldReturnEmptyForForceExtract(pathPrefix, text)) {
      return "";
    }
    return pathPrefix;
  }

  // For natural triggers, be more conservative:
  // Only trigger if we have a clear path indicator
  if (!hasPathIndicator(pathPrefix)) {
    return null;
  }

  // Additional check: don't trigger if the path looks like it's already completed
  // (i.e., doesn't end with a partial filename)
  // Only apply this check for paths that don't have clear path indicators
  // and look like single directory names (no path separators)
  if (isPartialPath(pathPrefix)) {
    return null;
  }

  return pathPrefix;
}
