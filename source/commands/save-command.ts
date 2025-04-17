import type { CommandOptions, ReplCommand } from "./types.ts";

export const saveCommand = ({ messageHistory, terminal }: CommandOptions) => {
  return {
    command: "/save",
    description: "Saves the chat history.",
    result: "continue" as const,
    getSubCommands: () => [],
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
      }

      terminal.info("Message history saved.");
    },
  } satisfies ReplCommand;
};
