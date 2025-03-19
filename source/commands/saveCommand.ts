import type { CommandOptions, ReplCommand } from "./types.ts";

export const saveCommand = ({ messageHistory }: CommandOptions) => {
  return {
    command: "/save",
    description: "Saves the chat history.",
    result: "continue" as const,
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
      }
    },
  } satisfies ReplCommand;
};
