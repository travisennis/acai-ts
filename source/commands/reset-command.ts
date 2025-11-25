import { setTerminalTitle } from "../terminal/formatting.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const resetCommand = ({
  modelManager,
  messageHistory,
}: CommandOptions): ReplCommand => {
  return {
    command: "/reset",
    aliases: ["/new"],
    description: "Saves the chat history and then resets it.",
    getSubCommands: () => Promise.resolve([]),

    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
        messageHistory.create(modelManager.getModel("repl").modelId);
      }

      setTerminalTitle(`acai: ${process.cwd()}`);

      container.clear();
      editor.setText("");
      tui.requestRender();
      return "continue";
    },
  };
};
