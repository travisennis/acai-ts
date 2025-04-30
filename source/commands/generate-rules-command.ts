import { analyzeConversation } from "../conversation-analyzer.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const generateRulesCommand = ({
  terminal,
  messageHistory,
  modelManager,
  tokenTracker,
}: CommandOptions): ReplCommand => {
  return {
    command: "/generate-rules",
    description:
      "Analyzes the current conversation to generate and save new interaction rules, then displays them.",
    result: "continue" as const,
    getSubCommands: () => [],
    execute: async () => {
      if (messageHistory.isEmpty()) {
        terminal.write("Cannot generate rules from an empty conversation.\n");
        return;
      }

      terminal.write("Analyzing conversation to generate rules...\n");
      try {
        const newRules = await analyzeConversation({
          modelManager,
          messages: messageHistory.get(), // Pass current history
          tokenTracker,
          terminal, // Pass terminal for potential logging within analyzer if needed
        });

        if (newRules && newRules.trim().length > 0) {
          terminal.write("Generated and saved the following rules:\n");
          terminal.write(`${newRules}\n`);
        } else {
          terminal.write("No new generalizable rules were identified.\n");
        }
      } catch (error) {
        terminal.write(
          `Error generating rules: ${error instanceof Error ? error.message : error}\n`,
        );
        console.error("Error during rule generation:", error);
      }
    },
  };
};
