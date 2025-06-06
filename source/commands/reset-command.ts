import type { CommandOptions, ReplCommand } from "./types.ts";

export const resetCommand = ({
  terminal,
  messageHistory,
}: CommandOptions): ReplCommand => {
  return {
    command: "/reset",
    description: "Saves the chat history and then resets it.",
    result: "continue" as const,
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
        messageHistory.clear();
      }
      terminal.setTitle(`acai: ${process.cwd()}`);

      terminal.clear();
    },
  };
};
