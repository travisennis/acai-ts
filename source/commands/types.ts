import type { ContextManager } from "../context/manager.ts";
import type { FileManager } from "../files/manager.ts";
import type { MessageHistory } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManager } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../tokenTracker.ts";

export interface ReplCommand {
  command: string;
  description: string;
  result: "break" | "continue" | "use";
  execute: (args: string[]) => Promise<void>;
}

export interface CommandOptions {
  contextManager: ContextManager;
  promptManager: PromptManager;
  modelManager: ModelManager;
  terminal: Terminal;
  messageHistory: MessageHistory;
  tokenTracker: TokenTracker;
  fileManager: FileManager;
}
