import type { Dirent } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

// Cache for directory listings to improve performance
class DirectoryCache {
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

const directoryCache = new DirectoryCache();

// Helper function to get directory entries with caching and timeout
async function getDirectoryEntries(dirs: string[]): Promise<Dirent[]> {
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

function isAttachableFile(filePath: string): boolean {
  // Check file extension for common text files that might be misidentified
  const textExtensions = [
    ".txt",
    ".md",
    ".markdown",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".php",
    ".rb",
    ".go",
    ".rs",
    ".swift",
    ".kt",
    ".scala",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".html",
    ".htm",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".xml",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".log",
    ".sql",
    ".r",
    ".R",
    ".m",
    ".pl",
    ".lua",
    ".vim",
    ".dockerfile",
    ".makefile",
    ".cmake",
    ".gradle",
    ".maven",
    ".properties",
    ".env",
  ];

  const ext = extname(filePath).toLowerCase();
  return textExtensions.includes(ext);
}

export interface AutocompleteItem {
  value: string;
  label: string;
  description?: string;
}

export interface SlashCommand {
  name: string;
  description?: string;
  // Function to get argument completions for this command
  // Returns null if no argument completion is available
  getArgumentCompletions?(argumentPrefix: string): AutocompleteItem[] | null;
}

export interface AutocompleteProvider {
  // Get autocomplete suggestions for current text/cursor position
  // Returns null if no suggestions available
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{
    items: AutocompleteItem[];
    prefix: string; // What we're matching against (e.g., "/" or "src/")
  } | null>;

  // Apply the selected item
  // Returns the new text and cursor position
  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): {
    lines: string[];
    cursorLine: number;
    cursorCol: number;
  };
}

// Combined provider that handles both slash commands and file paths
export class CombinedAutocompleteProvider implements AutocompleteProvider {
  private commands: (SlashCommand | AutocompleteItem)[];
  private allowedDirs: string[];

  constructor(
    commands: (SlashCommand | AutocompleteItem)[] = [],
    allowedDirs: string[] = [process.cwd()],
  ) {
    this.commands = commands;
    this.allowedDirs = allowedDirs;
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check for slash commands
    if (textBeforeCursor.startsWith("/")) {
      const spaceIndex = textBeforeCursor.indexOf(" ");

      if (spaceIndex === -1) {
        // No space yet - complete command names
        const prefix = textBeforeCursor.slice(1); // Remove the "/"
        const filtered = this.commands
          .filter((cmd) => {
            const name = "name" in cmd ? cmd.name : cmd.value; // Check if SlashCommand or AutocompleteItem
            return name?.toLowerCase().startsWith(prefix.toLowerCase());
          })
          .map((cmd) => ({
            value: "name" in cmd ? cmd.name : cmd.value,
            label: "name" in cmd ? cmd.name : cmd.label,
            ...(cmd.description && { description: cmd.description }),
          }));

        if (filtered.length === 0) return null;

        return {
          items: filtered,
          prefix: prefix, // Return the actual prefix used for filtering (without "/")
        };
      }
      // Space found - complete command arguments
      const commandName = textBeforeCursor.slice(1, spaceIndex); // Command without "/"
      const argumentText = textBeforeCursor.slice(spaceIndex + 1); // Text after space

      const command = this.commands.find((cmd) => {
        const name = "name" in cmd ? cmd.name : cmd.value;
        return name === commandName;
      });
      if (
        !command ||
        !("getArgumentCompletions" in command) ||
        !command.getArgumentCompletions
      ) {
        return null; // No argument completion for this command
      }

      const argumentSuggestions =
        command.getArgumentCompletions?.(argumentText);
      if (!argumentSuggestions || argumentSuggestions.length === 0) {
        return null;
      }

      return {
        items: argumentSuggestions,
        prefix: argumentText,
      };
    }

    // Check for file paths - triggered by Tab or if we detect a path pattern
    const pathMatch = this.extractPathPrefix(textBeforeCursor, false);

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
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check if we're completing a slash command (prefix doesn't start with "/" but we're in slash command context)
    if (textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ")) {
      // This is a command name completion
      const newLine = `${beforePrefix}${item.value} ${afterCursor}`;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;

      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length + 1, // +1 for space
      };
    }

    // Check if we're completing a file attachment (prefix starts with "@")
    if (prefix.startsWith("@")) {
      // This is a file attachment completion
      const newLine = `${beforePrefix + item.value} ${afterCursor}`;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;

      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length + 1, // +1 for space
      };
    }

    // Check if we're in a slash command context (beforePrefix contains "/command ")
    if (textBeforeCursor.includes("/") && textBeforeCursor.includes(" ")) {
      // This is likely a command argument completion
      const newLine = beforePrefix + item.value + afterCursor;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;

      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length,
      };
    }

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

  // Extract a path-like prefix from the text before cursor
  private extractPathPrefix(text: string, forceExtract = false): string | null {
    // Check for @ file attachment syntax first
    const atMatch = text.match(/@([^\s]*)$/);
    if (atMatch) {
      // For forced extraction, always return the @ prefix
      if (forceExtract) {
        return atMatch[0];
      }
      // For natural triggers, always return @ prefixes (they're always file-related)
      return atMatch[0];
    }

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

  // Check if a path is within any allowed directory
  private async isPathWithinAllowedDirs(
    requestedPath: string,
  ): Promise<boolean> {
    for (const allowedDir of this.allowedDirs) {
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

  // Get file/directory suggestions for a given path prefix
  private async getFileSuggestions(
    prefix: string,
  ): Promise<AutocompleteItem[]> {
    try {
      let searchDirs: string[];
      let searchPrefix: string;
      let expandedPrefix = prefix;
      let isAtPrefix = false;

      // Handle @ file attachment prefix
      if (prefix.startsWith("@")) {
        isAtPrefix = true;
        expandedPrefix = prefix.slice(1); // Remove the @
      }

      if (
        expandedPrefix === "" ||
        expandedPrefix === "./" ||
        expandedPrefix === "../" ||
        prefix === "@"
      ) {
        searchDirs = this.allowedDirs;
        searchPrefix = "";
      } else if (isAbsolute(expandedPrefix)) {
        // Handle absolute paths
        const isWithinAllowed =
          await this.isPathWithinAllowedDirs(expandedPrefix);
        if (!isWithinAllowed) {
          return [];
        }
        if (expandedPrefix.endsWith("/")) {
          searchDirs = [expandedPrefix];
          searchPrefix = "";
        } else {
          searchDirs = [dirname(expandedPrefix)];
          searchPrefix = basename(expandedPrefix);
        }
      } else if (expandedPrefix.endsWith("/")) {
        // If prefix ends with /, show contents of that directory
        // Try to find which allowed directory this path belongs to
        const allowedDirs: string[] = [];
        for (const allowedDir of this.allowedDirs) {
          const resolvedPath = join(allowedDir, expandedPrefix);
          const isWithinAllowed =
            await this.isPathWithinAllowedDirs(resolvedPath);
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
        const dir = dirname(expandedPrefix);
        const file = basename(expandedPrefix);
        const allowedDirs: string[] = [];
        for (const allowedDir of this.allowedDirs) {
          const resolvedPath = join(allowedDir, dir);
          const isWithinAllowed =
            await this.isPathWithinAllowedDirs(resolvedPath);
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

      for (const entry of entries) {
        const entryName = entry.name;
        if (!entryName.toLowerCase().startsWith(searchPrefix.toLowerCase())) {
          continue;
        }

        const fullPath = join(entry.parentPath, entryName);
        let isDirectory = false;
        try {
          // Add timeout to prevent hanging on slow file systems
          const stats = await Promise.race([
            stat(fullPath),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("File stat timeout")), 1000),
            ),
          ]);
          isDirectory = stats.isDirectory();
        } catch {
          // If stat fails or times out, skip this entry
          continue;
        }

        // For @ prefix, filter to only show directories and attachable files
        if (isAtPrefix && !isDirectory && !isAttachableFile(fullPath)) {
          continue;
        }

        // Check if the resulting path is within allowed directories
        if (!(await this.isPathWithinAllowedDirs(fullPath))) {
          continue;
        }

        // let relativePath: string;

        // Handle @ prefix path construction
        // if (isAtPrefix) {
        //   const pathWithoutAt = expandedPrefix;
        //   if (pathWithoutAt.endsWith("/")) {
        //     relativePath = `@${pathWithoutAt}${entryName}`;
        //   } else if (pathWithoutAt.includes("/")) {
        //     relativePath = `@${join(dirname(pathWithoutAt), entryName)}`;
        //   } else {
        //     relativePath = `@${entryName}`;
        //   }
        // } else if (prefix.endsWith("/")) {
        //   // If prefix ends with /, append entry to the prefix
        //   relativePath = prefix + entryName;
        // } else if (prefix.includes("/")) {
        //   relativePath = join(dirname(prefix), entryName);
        // } else {
        //   relativePath = entryName;
        // }

        suggestions.push({
          value: isDirectory ? `${fullPath}/` : fullPath,
          label: entryName,
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

  // Force file completion (called on Tab key) - always returns suggestions
  async getForceFileSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Don't trigger if we're in a slash command
    if (textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ")) {
      return null;
    }

    // Force extract path prefix - this will always return something
    const pathMatch = this.extractPathPrefix(textBeforeCursor, true);
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
}
