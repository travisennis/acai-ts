import type { MessageHistory } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManager } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import { byeCommand } from "./bye-command.ts";
import { commitCommand } from "./commit-command.ts";
import { compactCommand } from "./compact-command.ts";
import { editCommand } from "./edit-command.ts";
import { editPromptCommand } from "./edit-prompt-command.ts";
import { exitCommand } from "./exit-command.ts";
import { filesCommand } from "./files-command.ts";
import { helpCommand } from "./help-command.ts";
import { initCommand } from "./init-command.ts";
import { pasteCommand } from "./paste-command.ts";
import { promptCommand } from "./prompt-command.ts";
import { ptreeCommand } from "./ptree-command.ts";
import { resetCommand } from "./reset-command.ts";
import { reviewCommand } from "./review-command.ts";
import { saveCommand } from "./save-command.ts";
import { selectionsCommand } from "./selections-command.ts";
import { modelCommand } from "./model-command.ts";
import { memoryCommand } from "./memory-command.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export class CommandManager {
  private commands: Map<string, ReplCommand>;
  private promptManager: PromptManager;
  private modelManager: ModelManager;
  private messageHistory: MessageHistory;
  private tokenTracker: TokenTracker;
  private terminal: Terminal;

  constructor({
    promptManager,
    modelManager,
    terminal,
    messageHistory,
    tokenTracker,
  }: CommandOptions) {
    this.commands = new Map();
    this.promptManager = promptManager;
    this.modelManager = modelManager;
    this.terminal = terminal;
    this.messageHistory = messageHistory;
    this.tokenTracker = tokenTracker;
    this.initializeCommmands();
  }

  initializeCommmands() {
    // Import and register each command
    const options: CommandOptions = {
      promptManager: this.promptManager,
      modelManager: this.modelManager,
      terminal: this.terminal,
      messageHistory: this.messageHistory,
      tokenTracker: this.tokenTracker,
    };

    // Register all commands
    const cmds = [
      byeCommand(options),
      commitCommand(options),
      compactCommand(options),
      editCommand(options),
      editPromptCommand(options),
      exitCommand(options),
      filesCommand(options),
      initCommand(options),
      pasteCommand(options),
      promptCommand(options),
      ptreeCommand(options),
      resetCommand(options),
      reviewCommand(options),
      saveCommand(options),
      selectionsCommand(options),
      memoryCommand(options),
      modelCommand(options),
    ];

    // Add help command with access to all commands
    const helpCmd = helpCommand(options);
    cmds.push({
      ...helpCmd,
      execute: () => helpCmd.execute(this.commands),
    });

    // Register all commands
    for (const cmd of cmds) {
      this.commands.set(cmd.command, cmd);
    }
  }

  getCommands() {
    return Array.from(this.commands.keys()).sort();
  }

  getSubCommands(command: string): string[] {
    return this.commands.get(command)?.getSubCommands() ?? [];
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
