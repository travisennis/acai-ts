import type { MessageHistory } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManager } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";

export interface ReplCommand {
  command: string;
  description: string;
  result: "break" | "continue" | "use";
  getSubCommands: () => string[];
  execute: (args: string[]) => Promise<void>;
}

export interface CommandOptions {
  promptManager: PromptManager;
  modelManager: ModelManager;
  terminal: Terminal;
  messageHistory: MessageHistory;
  tokenTracker: TokenTracker;
}
