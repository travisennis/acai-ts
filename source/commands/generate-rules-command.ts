import { checkbox } from "@inquirer/prompts";
import { analyzeConversation } from "../conversation-analyzer.ts";
import { logger } from "../logger.ts"; // Import logger
import type { CommandOptions, ReplCommand } from "./types.ts";

async function _processAndSaveRules(
  newRules: string[] | null,
  terminal: CommandOptions["terminal"],
  config: CommandOptions["config"], // Simplified type
) {
  if (!newRules || newRules.length === 0) {
    terminal.warn("No new generalizable rules were identified.");
    return;
  }

  terminal.info("Generated potential rules:");
  terminal.lineBreak();

  const rulesToKeep = await checkbox({
    message: "Select the rules you want to keep:",
    choices: newRules.map((rule) => ({ name: rule, value: rule })),
  });

  if (rulesToKeep.length === 0) {
    terminal.warn("No rules selected to save.");
    return;
  }

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
}

export const generateRulesCommand = ({
  terminal,
  messageHistory,
  modelManager,
  tokenTracker,
  config, // This is the config module from CommandOptions
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

      terminal.lineBreak();
      terminal.info("Analyzing conversation to generate rules...");
      try {
        const newRules = await analyzeConversation({
          modelManager,
          messages: messageHistory.get(),
          tokenTracker,
          terminal,
        });

        // Pass the config object available in CommandOptions scope
        await _processAndSaveRules(newRules, terminal, config);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        terminal.error(`Error generating rules: ${errorMessage}`);
        logger.error(error, "Error during rule generation:");
      }
    },
  };
};
