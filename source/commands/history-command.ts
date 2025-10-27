import { MessageHistory } from "../messages.ts";
import { select } from "../terminal/select-prompt.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const historyCommand = ({
  messageHistory,
  terminal,
  config,
}: CommandOptions): ReplCommand => {
  return {
    command: "/history",
    description: "Browse and resume previous conversations.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      const appDir = config.app;
      const messageHistoryDir = await appDir.ensurePath("message-history");

      // Load all histories (use a large number to get all)
      const histories = await MessageHistory.load(messageHistoryDir, 1000);

      if (histories.length === 0) {
        terminal.info("No previous conversations found.");
        return "continue";
      }

      try {
        const choice = await select({
          message: "Select a conversation to resume:",
          choices: histories.map(
            (
              h: { title: string; updatedAt: Date; messages: unknown[] },
              index: number,
            ) => ({
              name: `${index + 1}: ${h.title} (${h.updatedAt.toLocaleString()})`,
              value: index,
              description: `${h.messages.length} messages`,
            }),
          ),
          pageSize: 15,
        });

        const selectedHistory = histories.at(choice);
        if (selectedHistory) {
          messageHistory.restore(selectedHistory);
          terminal.info(`Resuming conversation: ${selectedHistory.title}`);
          // Set terminal title after restoring
          terminal.setTitle(selectedHistory.title || `acai: ${process.cwd()}`);
        } else {
          // This case should theoretically not happen if choice is valid
          terminal.error("Selected history index out of bounds.");
        }
      } catch (error) {
        // Handle Ctrl-C cancellation
        if (
          error instanceof Error &&
          "isCanceled" in error &&
          error.isCanceled === true
        ) {
          terminal.info("History selection cancelled.");
          return "continue";
        }
        // Re-throw other errors
        throw error;
      }

      return "continue";
    },
  };
};
