import path from "node:path";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";

export const removeDirectoryCommand = ({
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
          new Text(style.red("Usage: /remove-directory <path>"), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      try {
        // Resolve the directory path
        const resolvedPath = path.resolve(directoryPath);

        // Check if it's the primary directory
        if (resolvedPath === workspace.primaryDir) {
          container.addChild(
            new Text(
              style.red("Cannot remove the primary working directory"),
              1,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        // Find the directory in the list
        const index = workspace.allowedDirs.indexOf(resolvedPath);
        if (index === -1) {
          container.addChild(
            new Text(
              style.red(`Directory not found in allowed list: ${resolvedPath}`),
              1,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        // Remove the directory
        workspace.allowedDirs.splice(index, 1);
        container.addChild(
          new Text(
            `Removed directory from allowed list: ${style.blue(resolvedPath)}`,
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
          new Text(
            style.red(`Failed to remove directory: ${errorMessage}`),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};
