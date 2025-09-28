import type { CommandOptions, ReplCommand } from "./types.ts";

export const saveCommand = ({
  messageHistory,
  terminal,
}: CommandOptions): ReplCommand => {
  return {
    command: "/save",
    description: "Saves the chat history.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
      }

      terminal.info("Message history saved.");
      return "continue";
    },
  };
};
