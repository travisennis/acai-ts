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
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      if (messageHistory.isEmpty()) {
        terminal.writeln("Cannot generate rules from an empty conversation.");
        return;
      }

      terminal.lineBreak(); // Add line break before output
      terminal.info("Analyzing conversation to generate rules...");
      try {
        const newRules = await analyzeConversation({
          modelManager,
          messages: messageHistory.get(), // Pass current history
          tokenTracker,
          terminal, // Pass terminal for potential logging within analyzer if needed
        });

        if (newRules && newRules.trim().length > 0) {
          terminal.info("Generated and saved the following rules:");
          terminal.lineBreak(); // Add line break before rules
          await terminal.display(newRules); // Use display for formatted rules
        } else {
          terminal.warn("No new generalizable rules were identified."); // Use warn for this case
        }
      } catch (error) {
        terminal.error(
          `Error generating rules: ${error instanceof Error ? error.message : error}`,
        );
        console.error("Error during rule generation:", error);
      }
    },
  };
};
