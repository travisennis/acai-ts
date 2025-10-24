import type { CommandOptions, ReplCommand } from "./types.ts";

export const resetCommand = ({
  modelManager,
  terminal,
  messageHistory,
}: CommandOptions): ReplCommand => {
  return {
    command: "/reset",
    aliases: ["/new"],
    description: "Saves the chat history and then resets it.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
        messageHistory.create(modelManager.getModel("repl").modelId);
      }
      terminal.setTitle(`acai: ${process.cwd()}`);

      terminal.clear();
      return "continue";
    },
  };
};
