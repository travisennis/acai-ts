import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Spacer, Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";

export const saveCommand = ({
  sessionManager: messageHistory,
}: CommandOptions): ReplCommand => {
  return {
    command: "/save",
    description: "Saves the chat history.",
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
      }

      container.addChild(new Spacer(1));
      container.addChild(new Text(style.green("Message history saved."), 0, 1));
      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
