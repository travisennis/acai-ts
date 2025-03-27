import { editor } from "@inquirer/prompts";
import {
  clearSavedSelections,
  formatSelection,
  getSavedSelections,
  updateSelections,
} from "../savedSelections/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const selectionsCommand = ({
  terminal,
  promptManager,
}: CommandOptions) => {
  return {
    command: "/selections",
    description: "Use and manage saved selections.",
    result: "continue" as const,
    execute: async (args: string[]) => {
      const subCommand = args[0];
      switch (subCommand) {
        case "use": {
          try {
            const selections = await getSavedSelections();
            for (const selection of selections) {
              promptManager.addContext(formatSelection(selection));
            }
            await clearSavedSelections();
            terminal.success(
              "Saved selections content will be added to your next prompt.",
            );
          } catch (error) {
            terminal.error(
              `Error reading selections: ${(error as Error).message}`,
            );
          }
          break;
        }
        case "edit": {
          try {
            const selections = await getSavedSelections();
            const edits = await editor({
              message: "Edit selections?",
              postfix: "json",
              default: JSON.stringify(selections, null, 2),
            });
            await updateSelections(edits);
          } catch (error) {
            terminal.error(
              `Error updating selections: ${(error as Error).message}`,
            );
          }
          break;
        }
        case "clear": {
          try {
            await clearSavedSelections();
            terminal.success("Saved selections successfuly cleared.");
          } catch (error) {
            terminal.error(
              `Error clearing selections: ${(error as Error).message}`,
            );
          }
          break;
        }
        default: {
          const validCommands = ["use", "edit", "clear"];
          if (subCommand) {
            terminal.warn(`Unrecognized selections subcommand: ${subCommand}`);
          } else {
            terminal.warn("Missing subcommand for /selections");
          }
          terminal.info(`Valid subcommands: ${validCommands.join(", ")}`);
          break;
        }
      }
    },
  } satisfies ReplCommand;
};
