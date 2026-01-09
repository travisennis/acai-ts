import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import { resolveDirectoryPath, validateDirectory } from "./utils.ts";

export const addDirectoryCommand = ({
  workspace,
}: CommandOptions): ReplCommand => {
  return {
    command: "/add-directory",
    description: "Add a directory to the list of allowed working directories",
    getSubCommands: async (): Promise<string[]> => {
      return [];
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
          new Text(style.red("Usage: /add-directory <path>"), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      try {
        const resolvedPath = resolveDirectoryPath(directoryPath);
        const isValid = await validateDirectory(resolvedPath);

        if (!isValid) {
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
          new Text(style.red(`Failed to add directory: ${errorMessage}`), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};
