import type { Container, Editor, TUI } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

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
      // In TUI mode, we can't clear the screen like terminal.clear()
      // Instead, we'll just clear the input and show a message
      container.clear();
      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
