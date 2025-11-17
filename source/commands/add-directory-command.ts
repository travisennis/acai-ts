import fs from "node:fs/promises";
import path from "node:path";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const addDirectoryCommand = ({
  terminal,
  workspace,
}: CommandOptions): ReplCommand => {
  return {
    command: "/add-directory",
    description: "Add a directory to the list of allowed working directories",
    getSubCommands: async (): Promise<string[]> => {
      return [];
    },
    execute: async (args: string[]) => {
      const directoryPath = args?.[0];
      if (!directoryPath) {
        terminal.error("Usage: /add-directory <path>");
        return "continue";
      }

      try {
        // Resolve and validate the directory
        const resolvedPath = path.resolve(directoryPath);
        const stats = await fs.stat(resolvedPath);

        if (!stats.isDirectory()) {
          terminal.error(`Path is not a directory: ${resolvedPath}`);
          return "continue";
        }

        // Check if directory is already in the list
        if (workspace.allowedDirs.includes(resolvedPath)) {
          terminal.warn(`Directory already in allowed list: ${resolvedPath}`);
          return "continue";
        }

        // Add the directory to the workspace
        workspace.allowedDirs.push(resolvedPath);
        terminal.writeln(
          `Added directory to allowed list: ${style.blue(resolvedPath)}`,
        );
        terminal.writeln(
          `Current allowed directories: ${style.blue(workspace.allowedDirs.join(", "))}`,
        );

        return "continue";
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        terminal.error(`Failed to add directory: ${errorMessage}`);
        return "continue";
      }
    },
    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const directoryPath = args?.[0];
      if (!directoryPath) {
        container.addChild(
          new Text(style.red("Usage: /add-directory <path>"), 1, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      try {
        // Resolve and validate the directory
        const resolvedPath = path.resolve(directoryPath);
        const stats = await fs.stat(resolvedPath);

        if (!stats.isDirectory()) {
          container.addChild(
            new Text(
              style.red(`Path is not a directory: ${resolvedPath}`),
              1,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        // Check if directory is already in the list
        if (workspace.allowedDirs.includes(resolvedPath)) {
          container.addChild(
            new Text(
              style.yellow(
                `Directory already in allowed list: ${resolvedPath}`,
              ),
              1,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        // Add the directory to the workspace
        workspace.allowedDirs.push(resolvedPath);
        container.addChild(
          new Text(
            `Added directory to allowed list: ${style.blue(resolvedPath)}`,
            1,
            0,
          ),
        );
        container.addChild(
          new Text(
            `Current allowed directories: ${style.blue(workspace.allowedDirs.join(", "))}`,
            2,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        container.addChild(
          new Text(style.red(`Failed to add directory: ${errorMessage}`), 1, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};
