import type { CommandOptions, ReplCommand } from "./types.ts";

export const resetCommand = ({
  messageHistory,
  tokenTracker,
  fileManager,
}: CommandOptions) => {
  return {
    command: "/reset",
    description: "Saves the chat history and then resets it.",
    result: "continue" as const,
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
        messageHistory.clear();
      }
      tokenTracker.reset();
      fileManager.clearAll();
    },
  } satisfies ReplCommand;
};
