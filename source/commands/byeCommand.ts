import type { CommandOptions, ReplCommand } from "./types.ts";

export const byeCommand = ({ messageHistory }: CommandOptions) => {
  return {
    command: "/bye",
    description: "Exits and saves the chat history.",
    result: "break" as const,
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
      }
    },
  } satisfies ReplCommand;
};
