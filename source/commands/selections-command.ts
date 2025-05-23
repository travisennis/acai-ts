import { editor } from "@inquirer/prompts";
import {
  clearSavedSelections,
  formatSelection,
  getSavedSelections,
  updateSelections,
} from "../saved-selections/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const selectionsCommand = ({
  terminal,
  promptManager,
}: CommandOptions): ReplCommand => {
  return {
    command: "/selections",
    description: "Use and manage saved selections.",
    result: "continue" as const,
    getSubCommands: () => Promise.resolve(["use", "edit", "clear"]),
    execute: async (args: string[]) => {
      const subCommand = args[0];
      switch (subCommand) {
        case "use":
          await handleUse(promptManager, terminal);
          break;
        case "edit":
          await handleEdit(terminal);
          break;
        case "clear":
          await handleClear(terminal);
          break;
        default:
          handleInvalidSubcommand(terminal, subCommand);
          break;
      }
    },
  };
};

async function handleUse(
  promptManager: CommandOptions["promptManager"],
  terminal: CommandOptions["terminal"],
) {
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
    terminal.error(`Error reading selections: ${(error as Error).message}`);
  }
}

async function handleEdit(terminal: CommandOptions["terminal"]) {
  try {
    const selections = await getSavedSelections();
    const edits = await editor({
      message: "Edit selections?",
      postfix: "json",
      default: JSON.stringify(selections, null, 2),
    });
    await updateSelections(edits);
  } catch (error) {
    terminal.error(`Error updating selections: ${(error as Error).message}`);
  }
}

async function handleClear(terminal: CommandOptions["terminal"]) {
  try {
    await clearSavedSelections();
    terminal.success("Saved selections successfuly cleared.");
  } catch (error) {
    terminal.error(`Error clearing selections: ${(error as Error).message}`);
  }
}

function handleInvalidSubcommand(
  terminal: CommandOptions["terminal"],
  subCommand: string | undefined,
) {
  const validCommands = ["use", "edit", "clear"];
  if (subCommand) {
    terminal.warn(`Unrecognized selections subcommand: ${subCommand}`);
  } else {
    terminal.warn("Missing subcommand for /selections");
  }
  terminal.info(`Valid subcommands: ${validCommands.join(", ")}`);
}
