import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const listDirectoriesCommand = ({
  terminal,
  workspace,
}: CommandOptions): ReplCommand => {
  return {
    command: "/list-directories",
    description: "List all allowed working directories",
    getSubCommands: async (): Promise<string[]> => {
      return [];
    },
    execute: async () => {
      terminal.header("Current working directories:");

      workspace.allowedDirs.forEach((dir) => {
        const isPrimary = dir === workspace.primaryDir;
        const prefix = isPrimary ? "● " : "  ";
        const indicator = isPrimary ? " (primary)" : "";
        terminal.writeln(`${prefix}${dir}${indicator}`);
      });

      if (workspace.allowedDirs.length === 0) {
        terminal.warn(
          "No directories configured. Using current directory only.",
        );
      }

      return "continue";
    },
    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      container.addChild(new Text("Current working directories:", 1, 0));

      workspace.allowedDirs.forEach((dir, index) => {
        const isPrimary = dir === workspace.primaryDir;
        const prefix = isPrimary ? "● " : "  ";
        const indicator = isPrimary ? style.blue(" (primary)") : "";
        container.addChild(
          new Text(`${prefix}${dir}${indicator}`, 2 + index, 0),
        );
      });

      if (workspace.allowedDirs.length === 0) {
        container.addChild(
          new Text(
            style.yellow(
              "No directories configured. Using current directory only.",
            ),
            2,
            0,
          ),
        );
      }

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
