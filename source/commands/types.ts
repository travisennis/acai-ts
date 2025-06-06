import type { ConfigManager } from "../config.ts";
import type { MessageHistory } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManager } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import type { TokenCounter } from "../token-utils.ts";
import type { Message } from "../tools/types.ts";

export interface ReplCommand {
  command: string;
  aliases?: string[];
  description: string;
  result: "break" | "continue" | "use";
  getSubCommands: () => Promise<string[]>;
  execute: (args: string[]) => Promise<void>;
}

export interface CommandOptions {
  promptManager: PromptManager;
  modelManager: ModelManager;
  terminal: Terminal;
  messageHistory: MessageHistory;
  tokenTracker: TokenTracker;
  config: ConfigManager;
  tokenCounter: TokenCounter;
  toolEvents: Map<string, Message[]>;
}
