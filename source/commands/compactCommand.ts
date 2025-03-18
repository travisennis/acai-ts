import type { CommandOptions, ReplCommand } from "./types.ts";

export const compactCommand = ({
  messageHistory,
  tokenTracker,
  fileManager,
}: CommandOptions) => {
  return {
    command: "/compact",
    description:
      "Saves, summarizes and resets the chat history with the summary.",
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