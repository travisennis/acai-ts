import { config } from "../config.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const memoryCommand = ({ terminal }: CommandOptions) => {
  return {
    command: "/memory",
    description: "Adds a new memory to the rules.md file.",
    result: "continue" as const,
    execute: async (args: string[]) => {
      const commandArgs = args.join(" ");
      const prefix = "add ";
      if (!commandArgs.startsWith(prefix)) {
        terminal.writeln("Usage: /memory add <new memory>");
        return;
      }

      const newMemory = commandArgs.substring(prefix.length).trim();
      if (!newMemory) {
        terminal.error("Error: Memory text cannot be empty.");
        return;
      }

      try {
        let currentContent = "";
        try {
          currentContent = await config.readRulesFile();
        } catch (error: any) {
          if (error.code === "ENOENT") {
            // File doesn't exist, treat as empty
            terminal.writeln("Info: rules file not found, creating new file.");
          } else {
            // Rethrow other errors
            throw error;
          }
        }

        const updatedContent = currentContent
          ? `${currentContent.trim()}\n -${newMemory}`
          : newMemory;

        await config.writeRulesFile(updatedContent);
        terminal.writeln("Memory added to rules");
      } catch (error) {
        terminal.error(
          `Error updating rules: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  } satisfies ReplCommand;
};
