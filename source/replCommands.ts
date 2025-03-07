import { envPaths } from "@travisennis/stdlib/env";
import { generateText } from "ai";
import Table from "cli-table3";
import { globby } from "globby";
import type { FileManager } from "./fileManager.ts";
import { getLanguageModel } from "./getLanguageModel.ts";
import {
  type MessageHistory,
  createAssistantMessage,
  createUserMessage,
} from "./messages.ts";
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

  async handle({ userInput }: { userInput: string }) {
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

    if (userInput.trim() === helpCommand.command) {
      displayUsage();
      return {
        break: false,
        continue: true,
      };
    }

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

        this.fileManager.addFile(...foundFiles);

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

    if (userInput.trim() === compactCommand.command) {
      if (!this.messageHistory.isEmpty()) {
        const langModel = getLanguageModel({
          model: "anthropic:haiku",
          stateDir: envPaths("acai").state,
          app: "repl",
        });
        // save existing message history
        await this.messageHistory.save();
        // summarize message history
        this.messageHistory.appendUserMessage(
          createUserMessage(
            "Provide a detailed but concise summary of our conversation above. Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.",
          ),
        );
        const { text, usage } = await generateText({
          model: langModel,
          system:
            "You are a helpful AI assistant tasked with summarizing conversations.",
          messages: this.messageHistory.get(),
        });
        //clear messages
        this.messageHistory.clear();
        // reset messages with the summary
        this.messageHistory.appendAssistantMessage(
          createAssistantMessage(text),
        );
        // update token counts with new message history
        this.tokenTracker.reset();
        this.tokenTracker.trackUsage("repl", {
          promptTokens: 0,
          completionTokens: usage.completionTokens,
          totalTokens: usage.completionTokens,
        });
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
