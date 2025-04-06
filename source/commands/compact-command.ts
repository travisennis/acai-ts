import type { CommandOptions, ReplCommand } from "./types.ts";

export const compactCommand = ({ messageHistory }: CommandOptions) => {
  return {
    command: "/compact",
    description:
      "Saves, summarizes and resets the chat history with the summary.",
    result: "continue" as const,
    getSubCommands: () => [],
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.summarizeAndReset();
      }
    },
  } satisfies ReplCommand;
};
