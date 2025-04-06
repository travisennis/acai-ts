import type { CommandOptions, ReplCommand } from "./types.ts";

export const exitCommand = ({ messageHistory }: CommandOptions) => {
  return {
    command: "/exit",
    description: "Exits and saves the chat history.",
    result: "break" as const,
    getSubCommands: () => [],
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
      }
    },
  } satisfies ReplCommand;
};
