import path from "node:path";
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
  };
};
