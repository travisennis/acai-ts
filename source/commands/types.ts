import type { ConfigManager } from "../config.ts";
import type { MessageHistory } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManagerApi } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import type { ToolExecutor } from "../tool-executor.ts";

export interface ReplCommand {
  command: string;
  aliases?: string[];
  description: string;
  getSubCommands: () => Promise<string[]>;
  execute: (args: string[]) => Promise<"break" | "continue" | "use">;
}

export interface CommandOptions {
  promptManager: PromptManagerApi;
  modelManager: ModelManager;
  terminal: Terminal;
  messageHistory: MessageHistory;
  tokenTracker: TokenTracker;
  config: ConfigManager;
  tokenCounter: TokenCounter;
  toolExecutor?: ToolExecutor;
  promptHistory: string[];
}
