import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { parse, relative, resolve, sep } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import Clipboard from "@crosscopy/clipboard";
import { asyncTry } from "@travisennis/stdlib/try";
import type { CommandManager } from "./commands/manager.ts";
import type { WorkspaceContext } from "./index.ts";
import { logger } from "./logger.ts";

const whitespaceRegex = /\s+/;

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

// Helper function to get directory entries with caching
async function getDirectoryEntries(dir: string): Promise<Dirent[]> {
  const cached = await directoryCache.get(dir);
  if (cached) {
    return cached;
  }

  const tryAttempt = await asyncTry(readdir(dir, { withFileTypes: true }));
  if (tryAttempt.isFailure) {
    return [];
  }

  const entries = tryAttempt.unwrap();
  directoryCache.set(dir, entries);
  return entries;
}

// Helper function to get completions from a specific directory
async function getCompletionsFromDir(
  line: string,
  dir: string,
  workspace: WorkspaceContext,
): Promise<string[]> {
  try {
    const words = line.split(" ");
    let last = words.at(-1);
    if (!last) {
      return [];
    }
    const isAt = last.startsWith("@");
    if (isAt) {
      last = last.slice(1);
    }

    let { dir: pathDir, base } = parse(last);

    // If pathDir is empty, use current directory
    if (!pathDir) {
      pathDir = ".";
    }

    // Resolve the path relative to the current directory
    const resolvedPath = resolve(dir, pathDir);

    // Check if resolved path is within any allowed directory
    const isWithinAllowed = workspace.allowedDirs.some((allowedDir) =>
      resolvedPath.startsWith(allowedDir),
    );

    if (!isWithinAllowed) {
      return [];
    }

    let dirEntries = await getDirectoryEntries(resolvedPath);

    // If we couldn't read the directory, try current directory
    if (dirEntries.length === 0 && pathDir !== ".") {
      dirEntries = await getDirectoryEntries(dir);
      pathDir = ".";
    }

    // For an exact match that is a directory, read the contents of the directory
    if (
      dirEntries.find((entry) => entry.name === base && entry.isDirectory())
    ) {
      const newPath =
        pathDir === "/" || pathDir === sep
          ? `${pathDir}${base}`
          : `${pathDir}/${base}`;
      const newResolvedPath = resolve(dir, newPath);
      dirEntries = await getDirectoryEntries(newResolvedPath);
      base = "";
      pathDir = newPath;
    } else {
      dirEntries = dirEntries.filter((entry) => entry.name.startsWith(base));
    }

    const hits = dirEntries
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => {
        const prefix =
          pathDir === "."
            ? ""
            : pathDir === sep || pathDir === "/"
              ? ""
              : `${pathDir}/`;
        const fullPath = `${prefix}${entry.name}${entry.isDirectory() && !entry.name.endsWith("/") ? "/" : ""}`;

        // Convert to relative path from primary directory for display
        const absolutePath = resolve(dir, fullPath);
        const relativePath = relative(workspace.primaryDir, absolutePath);

        return `${isAt ? "@" : ""}${relativePath.startsWith("..") ? relativePath : `./${relativePath}`}`;
      });

    return hits;
  } catch (_error) {
    return [];
  }
}

async function fileSystemCompleter(
  line: string,
  workspace: WorkspaceContext,
): Promise<[string[], string]> {
  try {
    const words = line.split(" ");
    let last = words.at(-1);
    if (!last) {
      return [[], line];
    }
    const isAt = last.startsWith("@");
    if (isAt) {
      last = last.slice(1);
    }

    // Search all directories in parallel
    const completionPromises = workspace.allowedDirs.map((dir) =>
      getCompletionsFromDir(line, dir, workspace),
    );

    const allResults = await Promise.all(completionPromises);
    const flattenedResults = allResults.flat();

    // Remove duplicates while preserving order
    const uniqueResults = [...new Set(flattenedResults)];

    return [uniqueResults, `${isAt ? "@" : ""}${last}`];
  } catch (_error) {
    logger.error(_error);
    return [[], line];
  }
}

export class ReplPrompt {
  // biome-ignore lint/suspicious/noExplicitAny: Keypress listener signature
  private keypressListener?: (str: string, key: any) => void;
  private rl: Interface;
  private history: string[];
  private maxHistory = 25;

  constructor({
    commands,
    history,
    workspace,
  }: {
    commands: CommandManager;
    history: string[];
    workspace: WorkspaceContext;
  }) {
    this.history = history;

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      history: this.history,
      historySize: this.maxHistory,
      completer: async (line): Promise<[string[], string]> => {
        const completions = commands.getCommands();
        const words = line.trim().split(whitespaceRegex);
        const firstWord = words[0] ?? "";
        const rest: string = words.slice(1).join(" ") ?? "";

        const matchingCommands = completions.filter((c) =>
          c.startsWith(firstWord),
        );

        if (matchingCommands.length === 1 && rest !== "") {
          // Single command matched, try to get subcommands
          const subCompletions = await commands.getSubCommands(
            matchingCommands[0] ?? "",
          );
          const hits = subCompletions.filter(
            (sc) => sc.startsWith(rest) || rest === "*",
          );
          if (hits.length > 0) {
            return [hits.map((h) => `${firstWord} ${h}`), line];
          }
        }

        if (
          matchingCommands.length > 0 &&
          (words.length === 1 || line.endsWith(" "))
        ) {
          return [matchingCommands, line];
        }

        return fileSystemCompleter(line, workspace); // [completions, line];
      },
    });

    if (process.stdin.isTTY) {
      this.keypressListener = async (
        _str: string,
        key: {
          name: string;
          ctrl: boolean;
          meta: boolean;
          shift: boolean;
          sequence: string;
        },
      ) => {
        // if (this.rl.closed) {
        //   if (this.keypressListener) {
        //     process.stdin.off("keypress", this.keypressListener);
        //     this.keypressListener = undefined;
        //   }
        //   return;
        // }

        if (key?.ctrl && key.name === "v" && !key.meta && !key.shift) {
          try {
            const clipboardText = await Clipboard.getText();
            if (clipboardText) {
              const currentLine = this.rl.line;
              const cursorPos = this.rl.cursor;

              const beforeCursor = currentLine.substring(0, cursorPos);
              const afterCursor = currentLine.substring(cursorPos);

              const newLine = beforeCursor + clipboardText + afterCursor;

              // biome-ignore lint/suspicious/noExplicitAny: Accessing internal readline method
              (this.rl as any).line = newLine;
              // biome-ignore lint/suspicious/noExplicitAny: Accessing internal readline method
              (this.rl as any).cursor = cursorPos + clipboardText.length;

              // biome-ignore lint/suspicious/noExplicitAny: Accessing internal readline method
              (this.rl as any)._refreshLine();
            }
          } catch (error) {
            logger.error(
              `Failed to paste from clipboard: ${(error as Error).message}`,
            );
          }
        }
      };
      process.stdin.on("keypress", this.keypressListener);
    }
  }

  async input() {
    const input = await this.rl.question("> ");

    // The readline interface automatically adds the input to the history.
    // We need to handle two things:
    // 1. Don't save empty lines.
    // 2. Enforce max history size.
    if (!input.trim()) {
      // Last entry was this empty input, so remove it.
      this.history.pop();
    } else {
      // A valid command was added. Trim history if needed.
      while (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    return input;
  }

  close() {
    if (this.keypressListener) {
      process.stdin.off("keypress", this.keypressListener);
      this.keypressListener = undefined;
    }
    this.rl.close();
  }

  [Symbol.dispose]() {
    this.close();
  }
}
