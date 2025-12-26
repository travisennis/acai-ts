import { extname } from "node:path";
import type { AutocompleteItem } from "./base-provider.ts";
import { PathProvider } from "./path-provider.ts";

export class AttachmentProvider extends PathProvider {
  override async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Only handle @ file attachments
    const pathMatch = textBeforeCursor.match(/@([^\s]*)$/);
    if (!pathMatch) {
      return null;
    }

    let prefix = pathMatch[0]; // Includes the @
    // Handle @ file attachment prefix
    if (prefix.startsWith("@")) {
      prefix = prefix.slice(1); // Remove the @
    } else {
      return null;
    }
    const suggestions = await this.getFileSuggestions(prefix);
    if (suggestions.length === 0) return null;

    // For @ prefix, filter to only show directories and attachable files
    const filteredSuggestions: AutocompleteItem[] = [];
    for (const suggestion of suggestions) {
      if (
        !suggestion.value.endsWith("/") &&
        !isAttachableFile(suggestion.value)
      ) {
        continue;
      }
      suggestion.value = `@${suggestion.value}`;
      filteredSuggestions.push(suggestion);
    }

    if (filteredSuggestions.length === 0) return null;

    return {
      items: filteredSuggestions,
      prefix: pathMatch[0],
    };
  }

  override applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const currentLine = lines[cursorLine] || "";
    const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
    const afterCursor = currentLine.slice(cursorCol);

    // Only handle @ file attachment completion if prefix starts with "@"
    if (prefix.startsWith("@")) {
      // Handle @ file attachment completion
      const newLine = `${beforePrefix + item.value} ${afterCursor}`;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;

      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length + 1, // +1 for space
      };
    }

    // If not an @ attachment, let other providers handle it
    return { lines, cursorLine, cursorCol };
  }

  // Force file completion (called on Tab key) - always returns suggestions
  override async getForceFileSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check for @ file attachment syntax first
    const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
    const pathMatch = atMatch ? atMatch[0] : null;
    console.log("pathMatch", textBeforeCursor, pathMatch);
    if (pathMatch !== null) {
      let prefix = pathMatch; // Includes the @
      // Handle @ file attachment prefix
      if (prefix.startsWith("@")) {
        prefix = prefix.slice(1); // Remove the @
      } else {
        return null;
      }
      const suggestions = await this.getFileSuggestions(prefix);
      if (suggestions.length === 0) return null;

      // For @ prefix, filter to only show directories and attachable files
      const filteredSuggestions: AutocompleteItem[] = [];
      for (const suggestion of suggestions) {
        if (
          !suggestion.value.endsWith("/") &&
          !isAttachableFile(suggestion.value)
        ) {
          continue;
        }
        suggestion.value = `@${suggestion.value}`;
        filteredSuggestions.push(suggestion);
      }

      if (filteredSuggestions.length === 0) return null;

      return {
        items: suggestions,
        prefix: pathMatch,
      };
    }

    return null;
  }
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
