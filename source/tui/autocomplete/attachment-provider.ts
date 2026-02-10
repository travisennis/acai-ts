import { extname } from "node:path";
import type { AutocompleteItem } from "./base-provider.ts";
import { FileSearchProvider } from "./file-search-provider.ts";

export class AttachmentProvider extends FileSearchProvider {
  override async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    const pathMatch = textBeforeCursor.match(/#([^\s]*)$/);
    if (!pathMatch) {
      return null;
    }

    const prefix = pathMatch[0];
    const searchTerm = pathMatch[1];

    const suggestions = await this.searchFiles(searchTerm);
    if (suggestions.length === 0) return null;

    const filteredSuggestions = suggestions.filter((s) =>
      isAttachableFile(s.value),
    );
    if (filteredSuggestions.length === 0) return null;

    for (const suggestion of filteredSuggestions) {
      suggestion.value = `#${suggestion.value}`;
    }

    return {
      items: filteredSuggestions,
      prefix,
    };
  }

  override applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    if (!prefix.startsWith("#")) {
      return { lines, cursorLine, cursorCol };
    }

    const currentLine = lines[cursorLine] || "";
    const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
    const afterCursor = currentLine.slice(cursorCol);

    const newLine = `${beforePrefix + item.value} ${afterCursor}`;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;

    return {
      lines: newLines,
      cursorLine,
      cursorCol: beforePrefix.length + item.value.length + 1,
    };
  }
}

function isAttachableFile(filePath: string): boolean {
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
