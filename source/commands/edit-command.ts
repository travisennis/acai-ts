import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { editor, search } from "@inquirer/prompts";
import { globby } from "globby";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const editCommand = ({ terminal }: CommandOptions): ReplCommand => {
  return {
    command: "/edit",
    description: "Opens file in $EDITOR for editing. Usage: /edit [file-path]",

    getSubCommands: () => Promise.resolve([]),
    execute: async (args: string[]): Promise<"break" | "continue" | "use"> => {
      let fileToEdit: string;

      if (args.length > 0) {
        // File path provided as argument
        const filePath = args.join(" "); // Handle file paths with spaces
        const resolvedPath = resolve(filePath);

        if (!existsSync(resolvedPath)) {
          terminal.error(`File not found: ${filePath}`);
          return "continue";
        }

        fileToEdit = filePath;
      } else {
        // No file path provided, use search prompt
        fileToEdit = await search({
          message: "Search for file:",
          source: async (input) => {
            if (!input) {
              return [];
            }

            const foundFiles = await globby(`**/*${input}*`, {
              gitignore: true,
            });

            return foundFiles.map((file) => ({
              name: file,
              value: file,
            }));
          },
        });
      }

      const content = readFileSync(fileToEdit, { encoding: "utf8" });

      const edit = await editor({
        message: `Edit ${fileToEdit}?`,
        postfix: extname(fileToEdit),
        default: content,
      });

      writeFileSync(fileToEdit, edit);

      if (content !== edit) {
        terminal.info(`File updated: ${fileToEdit}`);
      }
      return "continue";
    },
  };
};
