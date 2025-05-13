import { checkbox } from "@inquirer/prompts";
import { config } from "../config.ts";
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

        if (newRules && newRules.length > 0) {
          terminal.info("Generated potential rules:");
          terminal.lineBreak();

          const rulesToKeep = await checkbox({
            message: "Select the rules you want to keep:",
            choices: newRules.map((rule) => ({ name: rule, value: rule })),
          });

          if (rulesToKeep.length > 0) {
            terminal.info("Saving selected rules...");
            const existingRules = await config.readProjectLearnedRulesFile();
            const rulesToAdd = rulesToKeep.join("\n");
            const updatedProjectRules =
              existingRules.endsWith("\n") || existingRules.length === 0
                ? `${existingRules}${rulesToAdd}`
                : `${existingRules}\n${rulesToAdd}`;

            await config.writeProjectLearnedRulesFile(updatedProjectRules);
            terminal.success("Selected rules saved to project learned rules.");
            terminal.lineBreak();
            terminal.display(rulesToAdd); // Display only the saved rules
          } else {
            terminal.warn("No rules selected to save.");
          }
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
