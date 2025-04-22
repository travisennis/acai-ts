import type { CommandOptions, ReplCommand } from "./types.ts";

export const compactCommand = ({
  messageHistory,
  terminal,
}: CommandOptions): ReplCommand => {
  return {
    command: "/compact",
    description:
      "Saves, summarizes, and resets the chat history. Optional instructions can be provided for the summary.",
    result: "continue" as const,
    getSubCommands: () => [],
    execute: async (args: string[]) => {
      if (!messageHistory.isEmpty()) {
        const additionalInstructions = args.join(" ");
        await messageHistory.summarizeAndReset(additionalInstructions);
      }
      terminal.info("Message history summarized and reset.");
    },
  };
};
