import { readFile } from "node:fs/promises";
import { join, normalize, relative, resolve } from "node:path";
import { fdir } from "fdir";
import ignore from "../../utils/ignore.ts";
import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "./base-provider.ts";

const defaultIgnoredPatterns = [
  "**/node_modules",
  "**/dist",
  "**/.git",
  "**/coverage",
  "**/flow-typed",
  "**/.DS_Store",
  "**/*.log",
  "**/*.lock",
];

async function loadGitignorePatterns(cwd: string): Promise<string[]> {
  const gitignorePath = join(cwd, ".gitignore");
  try {
    const content = await readFile(gitignorePath, "utf8");
    const patterns: string[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      patterns.push(trimmed);
    }
    return patterns;
  } catch {
    return [];
  }
}

export class FileSearchProvider implements AutocompleteProvider {
  private maxResults = 20;
  private maxDepth = 3;

  async getSuggestions(
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
    if (suggestions.length === 0) {
      return null;
    }

    return {
      items: suggestions,
      prefix,
    };
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    // Only handle completions that start with #
    if (!prefix.startsWith("#")) {
      return { lines, cursorLine, cursorCol };
    }

    const currentLine = lines[cursorLine] || "";
    const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
    const afterCursor = currentLine.slice(cursorCol);

    const newLine = `${beforePrefix}${item.value} ${afterCursor}`;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;

    return {
      lines: newLines,
      cursorLine,
      cursorCol: beforePrefix.length + item.value.length + 1,
    };
  }

  private async searchFiles(searchTerm: string): Promise<AutocompleteItem[]> {
    const results: AutocompleteItem[] = [];
    const cwd = process.cwd();

    // Build ignore instance with .gitignore patterns + defaults
    const ig = ignore().add(defaultIgnoredPatterns);
    const gitignorePatterns = await loadGitignorePatterns(cwd);
    if (gitignorePatterns.length > 0) {
      ig.add(gitignorePatterns);
    }

    try {
      const crawler = new fdir()
        .withBasePath()
        .withMaxDepth(this.maxDepth)
        .exclude((dirName, dirPath) => {
          const fullPath = dirPath ? `${dirPath}/${dirName}` : dirName;
          const absolutePath = resolve(cwd, fullPath);
          const relativePath = normalize(relative(cwd, absolutePath));
          return ig.ignores(relativePath);
        });

      const files = await crawler.crawl(cwd).withPromise();

      const lowerSearchTerm = searchTerm.toLowerCase();
      const matches = files.filter((file) =>
        file.toLowerCase().includes(lowerSearchTerm),
      );

      for (const match of matches) {
        const absolutePath = resolve(cwd, match);
        const relativePath = normalize(relative(cwd, absolutePath));
        if (ig.ignores(relativePath)) {
          continue;
        }

        const isDirectory = match.endsWith("/");
        const pathWithoutTrailingSlash = isDirectory
          ? match.slice(0, -1)
          : match;
        const label =
          pathWithoutTrailingSlash.split("/").pop() || pathWithoutTrailingSlash;
        const parentPath = pathWithoutTrailingSlash
          .split("/")
          .slice(0, -1)
          .join("/");

        results.push({
          value: isDirectory ? `${match} ` : match,
          label,
          description: parentPath || ".",
        });

        if (results.length >= this.maxResults) {
          break;
        }
      }
    } catch {
      // Directory doesn't exist or not accessible
    }

    return results;
  }
}
