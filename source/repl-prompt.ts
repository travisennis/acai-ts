import { readdir } from "node:fs/promises";
import { parse, sep } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { asyncTry } from "@travisennis/stdlib/try";
import clipboardy from "clipboardy";
import type { CommandManager } from "./commands/manager.ts";
import { logger } from "./logger.ts";

const whitespaceRegex = /\s+/;

async function fileSystemCompleter(line: string): Promise<[string[], string]> {
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

    let { dir, base } = parse(last);

    // If dir is empty, use current directory
    if (!dir) {
      dir = ".";
    }

    let tryAttempt = await asyncTry(readdir(dir, { withFileTypes: true }));
    if (tryAttempt.isFailure) {
      tryAttempt = await asyncTry(readdir(".", { withFileTypes: true }));
    }

    let dirEntries = tryAttempt.unwrap();

    // for an exact match that is a directory, read the contents of the directory
    if (
      dirEntries.find((entry) => entry.name === base && entry.isDirectory())
    ) {
      dir = dir === "/" || dir === sep ? `${dir}${base}` : `${dir}/${base}`;
      dirEntries = await readdir(dir, { withFileTypes: true });
      base = "";
    } else {
      dirEntries = dirEntries.filter((entry) => entry.name.startsWith(base));
    }

    const hits = dirEntries
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => {
        const prefix =
          dir === "." ? "" : dir === sep || dir === "/" ? "" : `${dir}/`;
        return `${isAt ? "@" : ""}${prefix}${entry.name}${entry.isDirectory() && !entry.name.endsWith("/") ? "/" : ""}`;
      });

    return [hits, `${isAt ? "@" : ""}${last}`];
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
  }: { commands: CommandManager; history: string[] }) {
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

        return fileSystemCompleter(line); // [completions, line];
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
            const clipboardText = await clipboardy.read();
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
