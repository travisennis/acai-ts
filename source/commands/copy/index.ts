import Clipboard from "@crosscopy/clipboard";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Spacer, Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import { extractLastAssistantText } from "./utils.ts";

export function copyCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/copy",
    description: "Copy the last assistant response to the clipboard",

    async getSubCommands() {
      return [];
    },

    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const { sessionManager } = options;
      const history = sessionManager.get();

      container.addChild(new Spacer(1));

      const lastText = extractLastAssistantText(history);
      if (!lastText) {
        container.addChild(
          new Text(style.dim("No assistant response to copy."), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      try {
        await Clipboard.setText(lastText);
        container.addChild(
          new Text(style.dim("Copied last response to clipboard."), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        container.addChild(
          new Text(style.dim(`Could not copy to clipboard: ${message}`), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
}
