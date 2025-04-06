import { editor } from "@inquirer/prompts";
import { config } from "../config.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

async function readRules(
  terminal: CommandOptions["terminal"],
): Promise<string> {
  try {
    return await config.readRulesFile();
  } catch (error: any) {
    if (error.code === "ENOENT") {
      terminal.writeln("Info: rules file not found.");
      return ""; // Return empty string if file doesn't exist
    }
    terminal.error(
      `Error reading rules file: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error; // Rethrow for handling in execute
  }
}

async function writeRules(
  content: string,
  terminal: CommandOptions["terminal"],
): Promise<void> {
  try {
    await config.writeRulesFile(content);
    terminal.writeln("Rules updated successfully.");
  } catch (error) {
    terminal.error(
      `Error writing rules file: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error; // Rethrow for handling in execute
  }
}

export const memoryCommand = ({ terminal }: CommandOptions) => {
  return {
    command: "/memory",
    description:
      "View, add, or edit memories (rules). Usage: /memory [view|add <text>|edit]",
    result: "continue" as const,
    getSubCommands: () => [],
    execute: async (args: string[]) => {
      const subCommand = args[0] ?? "view"; // Default to 'view'
      const commandArgs = args.slice(1).join(" ");

      try {
        switch (subCommand) {
          case "view": {
            const currentContent = await readRules(terminal);
            if (currentContent) {
              terminal.writeln("--- Current Rules ---");
              terminal.writeln(currentContent);
              terminal.writeln("---------------------");
            } else {
              terminal.writeln(
                "No rules defined yet. Use '/memory add' or '/memory edit'.",
              );
            }
            break;
          }

          case "add": {
            const newMemory = commandArgs.trim();
            if (!newMemory) {
              terminal.error("Error: Memory text cannot be empty for 'add'.");
              terminal.writeln("Usage: /memory add <new memory text>");
              return;
            }
            const currentContent = await readRules(terminal);
            const updatedContent = currentContent
              ? `${currentContent.trim()}\n- ${newMemory}` // Ensure space after dash
              : `- ${newMemory}`; // Start with dash if new file
            await writeRules(updatedContent, terminal);
            break;
          }

          case "edit": {
            const currentContent = await readRules(terminal);
            const updatedContent = await editor({
              message: "Edit rules:",
              postfix: "md",
              default: currentContent,
            });
            // Check if the user cancelled the edit (editor returns the original content)
            // Or if the content is actually different
            if (updatedContent !== currentContent) {
              await writeRules(updatedContent, terminal);
            } else {
              terminal.writeln("Edit cancelled or no changes made.");
            }
            break;
          }

          default:
            terminal.writeln(
              "Invalid subcommand. Usage: /memory [view|add <text>|edit]",
            );
            break;
        }
      } catch (_error) {
        // Errors from read/write helpers are already logged
        terminal.error("Failed to execute memory command.");
      }
    },
  } satisfies ReplCommand;
};
