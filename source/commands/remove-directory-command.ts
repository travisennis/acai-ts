import path from "node:path";
import style from "../terminal/style.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const removeDirectoryCommand = ({
  terminal,
  workspace,
}: CommandOptions): ReplCommand => {
  return {
    command: "/remove-directory",
    description:
      "Remove a directory from the list of allowed working directories",
    getSubCommands: async (): Promise<string[]> => {
      // Return only non-primary directories for tab completion
      return workspace.allowedDirs.filter(
        (dir) => dir !== workspace.primaryDir,
      );
    },
    execute: async (args: string[]) => {
      const directoryPath = args?.[0];
      if (!directoryPath) {
        terminal.error("Usage: /remove-directory <path>");
        return "continue";
      }

      try {
        // Resolve the directory path
        const resolvedPath = path.resolve(directoryPath);

        // Check if it's the primary directory
        if (resolvedPath === workspace.primaryDir) {
          terminal.error("Cannot remove the primary working directory");
          return "continue";
        }

        // Find the directory in the list
        const index = workspace.allowedDirs.indexOf(resolvedPath);
        if (index === -1) {
          terminal.error(
            `Directory not found in allowed list: ${resolvedPath}`,
          );
          return "continue";
        }

        // Remove the directory
        workspace.allowedDirs.splice(index, 1);
        terminal.writeln(
          `Removed directory from allowed list: ${style.blue(resolvedPath)}`,
        );
        terminal.writeln(
          `Current allowed directories: ${style.blue(workspace.allowedDirs.join(", "))}`,
        );

        return "continue";
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        terminal.error(`Failed to remove directory: ${errorMessage}`);
        return "continue";
      }
    },
  };
};
