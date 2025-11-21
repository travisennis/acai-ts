import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { editor } from "../terminal/editor-prompt.ts";
import { search } from "../terminal/search-prompt.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import { glob } from "../utils/glob.ts";
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
          source: async (input: string) => {
            if (!input) {
              return [];
            }

            const foundFiles = await glob(`**/*${input}*`, {
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
        skipPrompt: true,
      });

      writeFileSync(fileToEdit, edit);

      if (content !== edit) {
        terminal.info(`File updated: ${fileToEdit}`);
      }
      return "continue";
    },
    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      let fileToEdit: string;

      if (args.length > 0) {
        // File path provided as argument
        const filePath = args.join(" "); // Handle file paths with spaces
        const resolvedPath = resolve(filePath);

        if (!existsSync(resolvedPath)) {
          container.addChild(
            new Text(style.red(`File not found: ${filePath}`), 0, 1),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        fileToEdit = filePath;
      } else {
        // No file path provided, show message for TUI
        container.addChild(
          new Text(style.red("File path required for /edit in TUI mode"), 0, 1),
        );
        container.addChild(
          new Text(style.dim("Usage: /edit <file-path>"), 2, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      const content = readFileSync(fileToEdit, { encoding: "utf8" });

      // For TUI mode, we can't use the editor prompt, so we'll just show file info
      container.addChild(
        new Text(`Editing file: ${style.blue(fileToEdit)}`, 0, 1),
      );
      container.addChild(
        new Text(`Content length: ${content.length} characters`, 2, 0),
      );
      container.addChild(
        new Text(
          style.dim("Note: Full file editing not available in TUI mode"),
          3,
          0,
        ),
      );
      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
