import type { CommandOptions, ReplCommand } from "./types.ts";

export const exitCommand = ({
  messageHistory,
}: CommandOptions): ReplCommand => {
  return {
    command: "/exit",
    aliases: ["/bye", "/quit"],
    description: "Exits and saves the chat history.",
    result: "break" as const,
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
      }
    },
  };
};
