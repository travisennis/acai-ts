import path from "node:path";
import { logger } from "../logger.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import { clearDirectory } from "../utils/filesystem.ts";
import type { ReplCommand } from "./types.ts";

export interface ExitCommandOptions {
  messageHistory: {
    isEmpty: () => boolean;
    save: () => Promise<void>;
  };
  terminal: {
    clear: () => void;
  };
  baseDir?: string | null;
}

export const exitCommand = ({
  messageHistory,
  terminal,
  baseDir,
}: ExitCommandOptions): ReplCommand => {
  return {
    command: "/exit",
    aliases: ["/bye", "/quit"],
    description: "Exits and saves the chat history.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      terminal.clear();
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
      }

      // Clear the .tmp directory on exit
      try {
        const tmpDirPath = path.join(baseDir ?? process.cwd(), ".tmp");
        await clearDirectory(tmpDirPath);
      } catch (error) {
        // Log error but don't block exit
        console.error("Failed to clear .tmp directory:", error);
      }

      return "break";
    },
    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
      }

      // Clear the .tmp directory on exit
      try {
        const tmpDirPath = path.join(baseDir ?? process.cwd(), ".tmp");
        await clearDirectory(tmpDirPath);
      } catch (error) {
        // Log error but don't block exit
        logger.error(error, "Failed to clear .tmp directory:");
      }

      container.addChild(new Text("Exiting...", 0, 1));
      tui.requestRender();
      editor.setText("");
      return "break";
    },
  };
};
