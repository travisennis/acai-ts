import { readdir } from "node:fs/promises";
import { parse, sep } from "node:path";
import { type Interface, createInterface } from "node:readline/promises";
import { asyncTry } from "@travisennis/stdlib/try";
import type { CommandManager } from "./commands/manager.ts";
import { logger } from "./logger.ts";

async function fileSystemCompleter(line: string): Promise<[string[], string]> {
  try {
    const words = line.split(" ");
    const last = words.at(-1);
    if (!last) {
      return [[], line];
    }
    let { dir, base } = parse(last);
    logger.debug(dir);
    logger.debug(base);

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
        return `${prefix}${entry.name}${entry.isDirectory() && !entry.name.endsWith("/") ? "/" : ""}`;
      });

    return [hits, last];
  } catch (_error) {
    logger.error(_error);
    return [[], line];
  }
}

export class ReplPrompt {
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
      completer: (line) => {
        const completions = commands.getCommands();
        const words = line.trim().split(/\s+/);
        const firstWord = words[0] ?? "";
        const rest: string = words.slice(1).join(" ") ?? "";

        const matchingCommands = completions.filter((c) =>
          c.startsWith(firstWord),
        );

        if (matchingCommands.length === 1 && rest !== "") {
          // Single command matched, try to get subcommands
          const subCompletions = commands.getSubCommands(
            matchingCommands[0] ?? "",
          );
          const hits = subCompletions.filter(
            (sc) => typeof sc === "string" && sc.startsWith(rest),
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
  }

  async input() {
    const input = await this.rl.question(" > ");
    this.saveHistory(input);
    return input;
  }

  close() {
    this.rl.close();
  }

  [Symbol.dispose]() {
    this.close();
  }
  // Function to save history
  saveHistory(input: string) {
    if (!input.trim()) {
      return; // Ignore empty input
    }
    if (this.history[this.history.length - 1] !== input) {
      this.history.push(input);
      if (this.history.length > this.maxHistory) {
        this.history.shift(); // Keep history size limited
      }
    }
  }
}
