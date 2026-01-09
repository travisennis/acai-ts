import type { Container, Editor, TUI } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";

export const clearCommand = (_options: CommandOptions): ReplCommand => {
  return {
    command: "/clear",
    description: "Clears the terminal screen.",
    getSubCommands: () => Promise.resolve([]),
    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      container.clear();
      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
