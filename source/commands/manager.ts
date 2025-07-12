import type { ConfigManager } from "../config.ts";
import type { MessageHistory } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManager } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import type { TokenCounter } from "../token-utils.ts";
import type { Message } from "../tools/types.ts";
import { applicationLogCommand } from "./application-log-command.ts";
import { clearCommand } from "./clear-command.ts";
import { commitCommand } from "./commit-command.ts";
import { compactCommand } from "./compact-command.ts";
import { editCommand } from "./edit-command.ts";
import { editPromptCommand } from "./edit-prompt-command.ts";
import { exitCommand } from "./exit-command.ts";
import { filesCommand } from "./files-command.ts";
import { generateRulesCommand } from "./generate-rules-command.ts";
import { helpCommand } from "./help-command.ts";
import { initCommand } from "./init-command.ts";
import { lastLogCommand } from "./last-log-command.ts";
import { modelCommand } from "./model-command.ts";
import { pasteCommand } from "./paste-command.ts";
import { prCommentsCommand } from "./pr-comments-command.ts";
import { promptCommand } from "./prompt-command.ts";
import { ptreeCommand } from "./ptree-command.ts";
import { resetCommand } from "./reset-command.ts";
import { reviewCommand } from "./review-command.ts";
import { rulesCommand } from "./rules-command.ts";
import { saveCommand } from "./save-command.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";
import { usageCommand } from "./usage-command.ts";

export class CommandManager {
  private commands: Map<string, ReplCommand>;
  private promptManager: PromptManager;
  private modelManager: ModelManager;
  private messageHistory: MessageHistory;
  private tokenTracker: TokenTracker;
  private terminal: Terminal;
  private config: ConfigManager;
  private tokenCounter: TokenCounter;
  private toolEvents: Map<string, Message[]>;

  constructor({
    promptManager,
    modelManager,
    terminal,
    messageHistory,
    tokenTracker,
    config,
    tokenCounter,
    toolEvents,
  }: CommandOptions) {
    this.commands = new Map();
    this.promptManager = promptManager;
    this.modelManager = modelManager;
    this.terminal = terminal;
    this.messageHistory = messageHistory;
    this.tokenTracker = tokenTracker;
    this.config = config;
    this.tokenCounter = tokenCounter;
    this.toolEvents = toolEvents;
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
      config: this.config,
      tokenCounter: this.tokenCounter,
      toolEvents: this.toolEvents,
    };

    // Register all commands
    const cmds = [
      clearCommand(options),
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
      rulesCommand(options),
      modelCommand(options),
      usageCommand(options),
      prCommentsCommand(options),
      lastLogCommand(options),
      generateRulesCommand(options),
      applicationLogCommand(options),
    ];

    // Add help command with access to all commands
    const helpCmd = helpCommand(options, this.commands);
    cmds.push({
      ...helpCmd,
      execute: () => helpCmd.execute([]),
    });

    // Register all commands
    for (const cmd of cmds) {
      this.commands.set(cmd.command, cmd);
      const aliases: string[] = cmd.aliases ?? [];
      for (const alias of aliases) {
        this.commands.set(alias, cmd);
      }
    }
  }

  getCommands() {
    return Array.from(this.commands.keys()).sort();
  }

  async getSubCommands(command: string): Promise<string[]> {
    return (await this.commands.get(command)?.getSubCommands()) ?? [];
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
