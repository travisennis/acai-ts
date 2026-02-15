import { basename, dirname, isAbsolute, join, relative } from "node:path";
import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "./base-provider.ts";
import {
  type DirentWithPath,
  extractPathPrefix,
  getDirectoryEntries,
  isPathWithinAllowedDirs,
} from "./utils.ts";

export class PathProvider implements AutocompleteProvider {
  protected allowedDirs: string[];

  constructor(allowedDirs: string[] = [process.cwd()]) {
    this.allowedDirs = allowedDirs;
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check for file paths - triggered by Tab or if we detect a path pattern
    const pathMatch = extractPathPrefix(textBeforeCursor, false);

    if (pathMatch !== null) {
      const suggestions = await this.getFileSuggestions(pathMatch);
      if (suggestions.length === 0) return null;

      return {
        items: suggestions,
        prefix: pathMatch,
      };
    }

    return null;
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const currentLine = lines[cursorLine] || "";
    const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
    const afterCursor = currentLine.slice(cursorCol);

    // For file paths, complete the path
    const newLine = beforePrefix + item.value + afterCursor;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;

    return {
      lines: newLines,
      cursorLine,
      cursorCol: beforePrefix.length + item.value.length,
    };
  }

  // Force file completion (called on Tab key) - always returns suggestions
  async getForceFileSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Force extract path prefix - this will always return something
    const pathMatch = extractPathPrefix(textBeforeCursor, true);
    if (pathMatch !== null) {
      const suggestions = await this.getFileSuggestions(pathMatch);
      if (suggestions.length === 0) return null;

      return {
        items: suggestions,
        prefix: pathMatch,
      };
    }

    return null;
  }

  // Check if we should trigger file completion (called on Tab key)
  shouldTriggerFileCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): boolean {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Don't trigger if we're in a slash command
    if (textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ")) {
      return false;
    }

    return true;
  }

  // Get file/directory suggestions for a given path prefix
  protected async getFileSuggestions(
    prefix: string,
  ): Promise<AutocompleteItem[]> {
    try {
      let searchDirs: string[];
      let searchPrefix: string;

      if (prefix === "" || prefix === "./" || prefix === "../") {
        searchDirs = this.allowedDirs;
        searchPrefix = "";
      } else if (isAbsolute(prefix)) {
        // Handle absolute paths
        const isWithinAllowed = await isPathWithinAllowedDirs(
          prefix,
          this.allowedDirs,
        );
        if (!isWithinAllowed) {
          return [];
        }
        if (prefix.endsWith("/")) {
          searchDirs = [prefix];
          searchPrefix = "";
        } else {
          searchDirs = [dirname(prefix)];
          searchPrefix = basename(prefix);
        }
      } else if (prefix.endsWith("/")) {
        // If prefix ends with /, show contents of that directory
        // Try to find which allowed directory this path belongs to
        const allowedDirs: string[] = [];
        for (const allowedDir of this.allowedDirs) {
          const resolvedPath = join(allowedDir, prefix);
          const isWithinAllowed = await isPathWithinAllowedDirs(
            resolvedPath,
            this.allowedDirs,
          );
          if (isWithinAllowed) {
            allowedDirs.push(resolvedPath);
          }
        }
        if (allowedDirs.length === 0) {
          return [];
        }
        searchDirs = allowedDirs;
        searchPrefix = "";
      } else {
        // Split into directory and file prefix
        const dir = dirname(prefix);
        const file = basename(prefix);
        const allowedDirs: string[] = [];
        for (const allowedDir of this.allowedDirs) {
          const resolvedPath = join(allowedDir, dir);
          const isWithinAllowed = await isPathWithinAllowedDirs(
            resolvedPath,
            this.allowedDirs,
          );
          if (isWithinAllowed) {
            allowedDirs.push(resolvedPath);
          }
        }
        if (allowedDirs.length === 0) {
          return [];
        }

        searchDirs = allowedDirs;
        searchPrefix = file;
      }

      const entries = await getDirectoryEntries(searchDirs);
      const suggestions: AutocompleteItem[] = [];

      // Filter entries by prefix first (fast string operation)
      const matchingEntries = entries.filter((entry) =>
        entry.name.toLowerCase().startsWith(searchPrefix.toLowerCase()),
      );

      // Batch check allowed paths (reduces repeated realpath calls)
      const validEntries: Array<{ entry: DirentWithPath; fullPath: string }> =
        [];
      for (const entry of matchingEntries) {
        const fullPath = join(entry.parentPath, entry.name);
        if (await isPathWithinAllowedDirs(fullPath, this.allowedDirs)) {
          validEntries.push({ entry, fullPath });
        }
      }

      const cwd = process.cwd();
      for (const { entry, fullPath } of validEntries) {
        // Use Dirent.isDirectory() - no extra stat() call needed
        const isDirectory = entry.isDirectory();
        const relativePath = relative(cwd, fullPath);

        suggestions.push({
          value: isDirectory ? `${relativePath}/` : relativePath,
          label: entry.name,
          description: isDirectory
            ? `directory ${entry.parentPath}`
            : `file ${entry.parentPath}`,
        });
      }

      // Sort directories first, then alphabetically
      suggestions.sort((a, b) => {
        const aIsDir = a.description === "directory";
        const bIsDir = b.description === "directory";
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.label.localeCompare(b.label);
      });

      return suggestions;
    } catch (_e) {
      // Directory doesn't exist or not accessible
      return [];
    }
  }
}
