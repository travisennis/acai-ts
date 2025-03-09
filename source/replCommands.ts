import Table from "cli-table3";
import { globby } from "globby";
import type { FileManager } from "./files/manager.ts";
import type { MessageHistory } from "./messages.ts";
import type { ModelMetadata } from "./models/providers.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./tokenTracker.ts";

interface ReplCommand {
  command: string;
  description: string;
}

const resetCommand = {
  command: "/reset",
  description: "Saves the chat history and then resets it.",
};

const saveCommand = {
  command: "/save",
  description: "Saves the chat history.",
};

const compactCommand = {
  command: "/compact",
  description: "Saves, summarizes and resets the chat history.",
};

const exitCommand = {
  command: "/exit",
  description: "Exits and saves the chat history.",
};

const byeCommand = {
  command: "/bye",
  description: "Exits and saves the chat history.",
};

const helpCommand = {
  command: "/help",
  description: "Shows usage table.",
};

const filesCommand = {
  command: "/files",
  description:
    "Finds files matching the given patterns and adds their content to the next prompt. Usage: /files src/**/*.ts",
};

export const replCommands: ReplCommand[] = [
  resetCommand,
  saveCommand,
  compactCommand,
  byeCommand,
  exitCommand,
  filesCommand,
  helpCommand,
] as const;

function displayUsage() {
  const table = new Table({
    head: ["command", "description"],
  });

  table.push(
    ...replCommands
      .sort((a, b) => (a.command > b.command ? 1 : -1))
      .map((cmd) => [cmd.command, cmd.description]),
  );

  console.info(table.toString());
}

export class ReplCommands {
  private messageHistory: MessageHistory;
  private tokenTracker: TokenTracker;
  private fileManager: FileManager;
  private terminal: Terminal;

  constructor({
    terminal,
    messageHistory,
    tokenTracker,
    fileManager,
  }: {
    terminal: Terminal;
    messageHistory: MessageHistory;
    tokenTracker: TokenTracker;
    fileManager: FileManager;
  }) {
    this.terminal = terminal;
    this.messageHistory = messageHistory;
    this.tokenTracker = tokenTracker;
    this.fileManager = fileManager;
  }

  async handle({
    userInput,
    modelConfig,
  }: { userInput: string; modelConfig: ModelMetadata }) {
    // /exit or /bye command
    if (
      userInput.trim() === exitCommand.command ||
      userInput.trim() === byeCommand.command
    ) {
      if (!this.messageHistory.isEmpty()) {
        await this.messageHistory.save();
      }
      return {
        break: true,
        continue: false,
      };
    }

    // /help command
    if (userInput.trim() === helpCommand.command) {
      displayUsage();
      return {
        break: false,
        continue: true,
      };
    }

    // /files command
    if (userInput.trim().startsWith(filesCommand.command)) {
      const patterns = userInput
        .trim()
        .substring(filesCommand.command.length)
        .trim();
      if (!patterns) {
        this.terminal.warn(
          "Please provide a file pattern. Usage: /files src/**/*.ts",
        );
        return {
          break: false,
          continue: true,
        };
      }

      try {
        this.terminal.header("Finding files:");
        const patternList = patterns.split(" ").filter(Boolean);
        const foundFiles = await globby(patternList, { gitignore: true });

        if (foundFiles.length === 0) {
          this.terminal.warn("No files found matching the pattern(s)");
          return {
            break: false,
            continue: true,
          };
        }

        this.terminal.header("Found files:");
        this.terminal.writeln("");

        for (const file of foundFiles) {
          this.terminal.writeln(`- ${file}`);
        }

        this.fileManager.addFiles({
          files: foundFiles,
          format: modelConfig.promptFormat,
        });

        this.terminal.writeln("");
        this.terminal.success(
          `File contents will be added to your next prompt (${foundFiles.length} files)`,
        );
        return {
          break: false,
          continue: true,
        };
      } catch (error) {
        this.terminal.error(
          `Error processing file patterns: ${(error as Error).message}`,
        );
        return {
          break: false,
          continue: true,
        };
      }
    }

    // /reset command
    if (userInput.trim() === resetCommand.command) {
      if (!this.messageHistory.isEmpty()) {
        await this.messageHistory.save();
        this.messageHistory.clear();
      }
      this.tokenTracker.reset();
      this.fileManager.clearAll();
      return {
        break: false,
        continue: true,
      };
    }

    // /compact command
    if (userInput.trim() === compactCommand.command) {
      if (!this.messageHistory.isEmpty()) {
        await this.messageHistory.summarizeAndReset();
      }
      this.fileManager.clearPendingContent();
      return {
        break: false,
        continue: true,
      };
    }
    return {
      break: false,
      continue: false,
    };
  }
}
