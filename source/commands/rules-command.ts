import { editor } from "@inquirer/prompts";
import { config } from "../config.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const rulesCommand = ({ terminal }: CommandOptions): ReplCommand => {
  return {
    command: "/rules",
    description:
      "View, add, or edit rules. Usage: /rules [view|add <text>|edit]",
    result: "continue" as const,
    getSubCommands: () => Promise.resolve(["view", "add", "edit"]),
    execute: async (args: string[]) => {
      const subCommand = args[0] ?? "view"; // Default to 'view'
      const commandArgs = args.slice(1).join(" ");

      try {
        switch (subCommand) {
          case "view": {
            const currentContent = await config.readRulesFile();
            if (currentContent) {
              terminal.writeln("--- Current Rules ---");
              terminal.writeln(currentContent);
              terminal.writeln("---------------------");
            } else {
              terminal.writeln(
                "No rules defined yet. Use '/rules add' or '/rules edit'.",
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
            const currentContent = await config.readRulesFile();
            const updatedContent = currentContent
              ? `${currentContent.trim()}\n- ${newMemory}` // Ensure space after dash
              : `- ${newMemory}`; // Start with dash if new file
            await config.writeRulesFile(updatedContent);
            break;
          }

          case "edit": {
            const currentContent = await config.readRulesFile();
            const updatedContent = await editor({
              message: "Edit rules:",
              postfix: "md",
              default: currentContent,
            });
            // Check if the user cancelled the edit (editor returns the original content)
            // Or if the content is actually different
            if (updatedContent !== currentContent) {
              await config.writeRulesFile(updatedContent);
            } else {
              terminal.writeln("Edit cancelled or no changes made.");
            }
            break;
          }

          default:
            terminal.writeln(
              "Invalid subcommand. Usage: /rules [view|add <text>|edit]",
            );
            break;
        }
      } catch (_error) {
        // Errors from read/write helpers are already logged
        terminal.error("Failed to execute memory command.");
      }
    },
  };
};
