import { getTerminalSize } from "../terminal/formatting.ts";
import { table } from "../terminal/index.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const helpCommand = (
  { terminal }: CommandOptions,
  cmds: Map<string, ReplCommand>,
): ReplCommand => {
  return {
    command: "/help",
    description: "Shows available commands.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      const commands = cmds;

      const entries: [string, string][] = Array.from(commands.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, cmd]) => [key, cmd.description]);

      terminal.table(entries, {
        header: ["Command", "Description"],
        colWidths: [30, 70],
      });

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
      const commands = cmds;

      const entries: [string, string][] = Array.from(commands.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, cmd]) => [key, cmd.description]);

      const { columns } = getTerminalSize();

      const output = table(entries, {
        header: ["Command", "Description"],
        colWidths: [30, 70],
        width: columns,
      });

      container.addChild(new Text(output));
      tui.requestRender();
      editor.setText("");

      return "continue";
    },
  };
};
