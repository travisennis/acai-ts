import type { CommandOptions, ReplCommand } from "./types.ts";

export const exitCommand = ({
  messageHistory,
  terminal,
}: CommandOptions): ReplCommand => {
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
      return "break";
    },
  };
};
