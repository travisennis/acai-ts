import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { editor, search } from "@inquirer/prompts";
import { globby } from "globby";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const editCommand = ({ terminal }: CommandOptions) => {
  return {
    command: "/edit",
    description: "Opens files in $EDITOR for editing.",
    result: "continue" as const,
    execute: async () => {
      const fileToEdit = await search({
        message: "Select a file",
        source: async (input) => {
          if (!input) {
            return [];
          }

          const foundFiles = await globby(input, { gitignore: true });

          return foundFiles.map((file) => ({
            name: file,
            value: file,
          }));
        },
      });

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
    },
  } satisfies ReplCommand;
};
