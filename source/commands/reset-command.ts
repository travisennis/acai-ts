import type { Container, Editor, TUI } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const resetCommand = ({
  modelManager,
  terminal,
  messageHistory,
}: CommandOptions): ReplCommand => {
  return {
    command: "/reset",
    aliases: ["/new"],
    description: "Saves the chat history and then resets it.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
        messageHistory.create(modelManager.getModel("repl").modelId);
      }
      terminal.setTitle(`acai: ${process.cwd()}`);

      terminal.clear();
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
      if (!messageHistory.isEmpty()) {
        await messageHistory.save();
        messageHistory.create(modelManager.getModel("repl").modelId);
      }

      terminal.setTitle(`acai: ${process.cwd()}`);

      container.clear();
      editor.setText("");
      tui.requestRender();
      return "continue";
    },
  };
};
