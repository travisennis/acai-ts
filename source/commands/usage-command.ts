import { getTerminalSize } from "../terminal/formatting.ts";
import { table } from "../terminal/index.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function usageCommand({
  terminal,
  tokenTracker,
}: CommandOptions): ReplCommand {
  return {
    command: "/usage",
    description: "Show token usage breakdown",

    getSubCommands: () => Promise.resolve([]),
    async execute(): Promise<"break" | "continue" | "use"> {
      const entries = Object.entries(tokenTracker.getUsageBreakdown());
      if (entries.length === 0) {
        terminal.info("No usage yet.");
      } else {
        terminal.table(entries, {
          header: ["App", "Tokens"],
          colWidths: [30, 70],
        });
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
      const entries = Object.entries(tokenTracker.getUsageBreakdown());
      if (entries.length === 0) {
        container.addChild(new Text("No usage yet.", 1, 0));
      } else {
        const { columns } = getTerminalSize();
        const tableOutput = table(entries, {
          header: ["App", "Tokens"],
          colWidths: [30, 70],
          width: columns,
        });
        container.addChild(new Text(tableOutput, 1, 0));
      }

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
}
