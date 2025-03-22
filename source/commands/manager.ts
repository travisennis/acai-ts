import type { ContextManager } from "../context/manager.ts";
import type { MessageHistory } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManager } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../tokenTracker.ts";
import { byeCommand } from "./byeCommand.ts";
import { commitCommand } from "./commitCommand.ts";
import { compactCommand } from "./compactCommand.ts";
import { contextCommand } from "./contextCommand.ts";
import { editCommand } from "./editCommand.ts";
import { exitCommand } from "./exitCommand.ts";
import { explainCommand } from "./explainCommand.ts";
import { filesCommand } from "./filesCommand.ts";
import { helpCommand } from "./helpCommand.ts";
import { initCommand } from "./initCommand.ts";
import { pasteCommand } from "./pasteCommand.ts";
import { promptCommand } from "./promptCommand.ts";
import { ptreeCommand } from "./ptreeCommand.ts";
import { resetCommand } from "./resetCommand.ts";
import { saveCommand } from "./saveCommand.ts";
import { selectionsCommand } from "./selections.ts";
import { todoCommand } from "./todoCommand.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export class CommandManager {
  private commands: Map<string, ReplCommand>;
  private promptManager: PromptManager;
  private modelManager: ModelManager;
  private messageHistory: MessageHistory;
  private tokenTracker: TokenTracker;
  private terminal: Terminal;
  private contextManager: ContextManager;

  constructor({
    promptManager,
    modelManager,
    terminal,
    messageHistory,
    tokenTracker,
    contextManager,
  }: CommandOptions) {
    this.commands = new Map();
    this.promptManager = promptManager;
    this.modelManager = modelManager;
    this.terminal = terminal;
    this.messageHistory = messageHistory;
    this.tokenTracker = tokenTracker;
    this.contextManager = contextManager;
    this.initializeCommmands();
  }

  initializeCommmands() {
    // Import and register each command
    const options: CommandOptions = {
      contextManager: this.contextManager,
      promptManager: this.promptManager,
      modelManager: this.modelManager,
      terminal: this.terminal,
      messageHistory: this.messageHistory,
      tokenTracker: this.tokenTracker,
    };

    // Register all commands
    const cmds = [
      resetCommand(options),
      saveCommand(options),
      compactCommand(options),
      exitCommand(options),
      byeCommand(options),
      explainCommand(options),
      contextCommand(options),
      todoCommand(options),
      promptCommand(options),
      filesCommand(options),
      ptreeCommand(options),
      editCommand(options),
      initCommand(options),
      todoCommand(options),
      contextCommand(options),
      explainCommand(options),
      pasteCommand(options),
      selectionsCommand(options),
      commitCommand(options),
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
    return Array.from(this.commands.keys());
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
