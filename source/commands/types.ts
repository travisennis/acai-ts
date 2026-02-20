import type { ConfigManager } from "../config/index.ts";
import type { WorkspaceContext } from "../index.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManagerApi } from "../prompts/manager.ts";
import type { SessionManager } from "../sessions/manager.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";

export interface ReplCommand {
  command: string;
  aliases?: string[];
  description: string;
  getSubCommands: () => Promise<string[]>;
  handle: (
    args: string[],
    options: {
      tui: TUI;
      container: Container;
      inputContainer: Container;
      editor: Editor;
    },
  ) => Promise<"break" | "continue" | "use">;
}

export interface CommandOptions {
  promptManager: PromptManagerApi;
  modelManager: ModelManager;
  sessionManager: SessionManager;
  tokenTracker: TokenTracker;
  config: ConfigManager;
  tokenCounter: TokenCounter;
  promptHistory: string[];
  workspace: WorkspaceContext;
}
