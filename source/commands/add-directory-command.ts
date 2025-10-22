import fs from "node:fs/promises";
import path from "node:path";
import style from "../terminal/style.ts";
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
  };
};
