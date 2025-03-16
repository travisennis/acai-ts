import { readFileSync, writeFileSync } from "node:fs";
import fs, { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import path from "node:path";
import { editor, search } from "@inquirer/prompts";
import Table from "cli-table3";
import { globby } from "globby";
import { getAppConfigDir, getProjectConfigDir } from "../config.ts";
import type { FileManager } from "../files/manager.js";
import type { MessageHistory } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManager } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../tokenTracker.ts";
import { directoryTree } from "../tools/filesystem.ts";

interface ReplCommand {
  command: string;
  description: string;
  result: "break" | "continue" | "use";
  execute: (args: string[]) => Promise<void>;
}

export class CommandManager {
  private commands: Map<string, ReplCommand>;
  private promptManager: PromptManager;
  private modelManager: ModelManager;
  private messageHistory: MessageHistory;
  private tokenTracker: TokenTracker;
  private fileManager: FileManager;
  private terminal: Terminal;

  constructor({
    promptManager,
    modelManager,
    terminal,
    messageHistory,
    tokenTracker,
    fileManager,
  }: {
    promptManager: PromptManager;
    modelManager: ModelManager;
    terminal: Terminal;
    messageHistory: MessageHistory;
    tokenTracker: TokenTracker;
    fileManager: FileManager;
  }) {
    this.commands = new Map();
    this.promptManager = promptManager;
    this.modelManager = modelManager;
    this.terminal = terminal;
    this.messageHistory = messageHistory;
    this.tokenTracker = tokenTracker;
    this.fileManager = fileManager;
    this.initializeCommmands();
  }

  initializeCommmands() {
    const resetCommand = {
      command: "/reset",
      description: "Saves the chat history and then resets it.",
      result: "continue" as const,
      execute: async () => {
        if (!this.messageHistory.isEmpty()) {
          await this.messageHistory.save();
          this.messageHistory.clear();
        }
        this.tokenTracker.reset();
        this.fileManager.clearAll();
      },
    };
    this.commands.set(resetCommand.command, resetCommand);

    const saveCommand = {
      command: "/save",
      description: "Saves the chat history.",
      result: "continue" as const,
      execute: async () => {
        if (!this.messageHistory.isEmpty()) {
          await this.messageHistory.save();
        }
      },
    };
    this.commands.set(saveCommand.command, saveCommand);

    const compactCommand = {
      command: "/compact",
      description:
        "Saves, summarizes and resets the chat history with the summary.",
      result: "continue" as const,
      execute: async () => {
        if (!this.messageHistory.isEmpty()) {
          await this.messageHistory.save();
          this.messageHistory.clear();
        }
        this.tokenTracker.reset();
        this.fileManager.clearAll();
      },
    };
    this.commands.set(compactCommand.command, compactCommand);

    const exitCommand = {
      command: "/exit",
      description: "Exits and saves the chat history.",
      result: "break" as const,
      execute: async () => {
        if (!this.messageHistory.isEmpty()) {
          await this.messageHistory.save();
        }
      },
    };
    this.commands.set(exitCommand.command, exitCommand);

    const byeCommand = {
      command: "/bye",
      description: "Exits and saves the chat history.",
      result: "break" as const,
      execute: async () => {
        if (!this.messageHistory.isEmpty()) {
          await this.messageHistory.save();
        }
      },
    };
    this.commands.set(byeCommand.command, byeCommand);

    const helpCommand = {
      command: "/help",
      description: "Shows usage table.",
      result: "continue" as const,
      execute: () => {
        const table = new Table({
          head: ["command", "description"],
        });

        table.push(
          ...Array.from(this.commands.values())
            .sort((a, b) => (a.command > b.command ? 1 : -1))
            .map((cmd) => [cmd.command, cmd.description]),
        );

        console.info(table.toString());
        return Promise.resolve();
      },
    };
    this.commands.set(helpCommand.command, helpCommand);

    const filesCommand = {
      command: "/files",
      description:
        "Finds files matching the given patterns and adds their content to the next prompt. Usage: /files src/**/*.ts",
      result: "continue" as const,
      execute: async (args: string[]) => {
        if (!args || args.length === 0) {
          this.terminal.warn(
            "Please provide a file pattern. Usage: /files src/**/*.ts",
          );
          return;
        }

        try {
          this.terminal.header("Finding files:");
          const patternList = args.filter(Boolean);
          const foundFiles = await globby(patternList, { gitignore: true });

          if (foundFiles.length === 0) {
            this.terminal.warn("No files found matching the pattern(s)");
            return;
          }

          this.terminal.header("Found files:");
          this.terminal.writeln("");

          for (const file of foundFiles) {
            this.terminal.writeln(`- ${file}`);
          }

          this.fileManager.addFiles({
            files: foundFiles,
            format: this.modelManager.getModelMetadata("repl").promptFormat,
          });

          this.terminal.writeln("");
          this.terminal.success(
            `File contents will be added to your next prompt (${foundFiles.length} files)`,
          );
        } catch (error) {
          this.terminal.error(
            `Error processing file patterns: ${(error as Error).message}`,
          );
        }
      },
    };
    this.commands.set(filesCommand.command, filesCommand);

    const ptreeCommand = {
      command: "/ptree",
      description: "Displays the project tree.",
      result: "continue" as const,
      execute: async () => {
        this.terminal.display(await directoryTree(process.cwd()));
      },
    };
    this.commands.set(ptreeCommand.command, ptreeCommand);

    const editCommand = {
      command: "/edit",
      description: "Opens files in $EDITOR for editing.",
      result: "continue" as const,
      execute: async () => {
        const fileToEdit = await search({
          message: "Select a file",
          source: async (input) => {
            if (!input) {
              return [];
            }

            const foundFiles = await globby(input, { gitignore: true });

            return foundFiles.map((file) => ({
              name: file,
              value: file,
            }));
          },
        });

        const content = readFileSync(fileToEdit, { encoding: "utf8" });

        const edit = await editor({
          message: `Edit ${fileToEdit}?`,
          postfix: extname(fileToEdit),
          default: content,
        });

        writeFileSync(fileToEdit, edit);

        if (content !== edit) {
          this.terminal.info(`File updated: ${fileToEdit}`);
        }
      },
    };
    this.commands.set(editCommand.command, editCommand);

    const promptCommand = {
      command: "/prompt",
      description: "Loads and executes user and project prompts.",
      result: "use" as const,
      execute: async (args: string[]) => {
        if (!args || args.length === 0) {
          this.terminal.warn(
            "Please provide a prompt type and name. Usage: /prompt user:optimize or /prompt project:optimize",
          );
          return;
        }

        const promptArg = args[0];
        const [typeStr, promptName] = promptArg.split(":");

        if (!(typeStr && promptName)) {
          this.terminal.warn(
            "Invalid prompt format. Use: /prompt user:name or /prompt project:name",
          );
          return;
        }

        let promptPath = "";
        const type = typeStr.toLowerCase();

        try {
          if (type === "project") {
            // Project prompts are stored in the project config directory
            promptPath = path.join(
              getProjectConfigDir(),
              "prompts",
              `${promptName}.md`,
            );
          } else if (type === "user") {
            // User prompts are stored in the user data directory
            const userPromptDir = path.join(getAppConfigDir(), "prompts");
            await fs.mkdir(userPromptDir, { recursive: true });
            promptPath = join(userPromptDir, `${promptName}.md`);
          } else {
            this.terminal.warn(
              `Unknown prompt type: ${type}. Use 'user' or 'project'`,
            );
            return;
          }

          let promptContent: string;
          try {
            promptContent = await readFile(promptPath, "utf8");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              this.terminal.error(
                `Prompt not found: ${promptName} (${type}). Check that the file exists at ${promptPath}`,
              );
              return;
            }
            throw error;
          }

          this.terminal.info(`Loaded prompt: ${promptName} (${type})`);
          this.promptManager.push(promptContent);
        } catch (error) {
          this.terminal.error(
            `Error loading prompt: ${(error as Error).message}`,
          );
        }
      },
    };
    this.commands.set(promptCommand.command, promptCommand);
  }

  async handle({ userInput }: { userInput: string }) {
    const commandArgs = userInput.split(" ");
    const command = commandArgs.at(0);
    const args = commandArgs.slice(1);

    if (command) {
      const replCommand = this.commands.get(command);
      if (replCommand) {
        await replCommand.execute(args);
        if (replCommand.result === "continue") {
          return {
            continue: true,
            break: false,
          };
        }
        if (replCommand.result === "break") {
          return {
            continue: false,
            break: true,
          };
        }
      }
    }
    return {
      continue: false,
      break: false,
    };
  }
}
