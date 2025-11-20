import Clipboard from "@crosscopy/clipboard";
import type { ModelMessage, TextPart } from "ai";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Spacer, Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

function extractLastAssistantText(messages: ModelMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as ModelMessage | undefined;
    if (!msg) continue;
    if (msg.role !== "assistant") continue;
    if (!("content" in msg) || !Array.isArray(msg.content)) continue;

    // Find last text part
    for (let j = msg.content.length - 1; j >= 0; j--) {
      const part = msg.content[j];
      if (
        part &&
        part.type === "text" &&
        typeof (part as TextPart).text === "string"
      ) {
        const text = (part as TextPart).text;
        if (text.trim().length > 0) return text;
      }
    }
  }
  return null;
}

export function copyCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/copy",
    description: "Copy the last assistant response to the clipboard",

    async getSubCommands() {
      return [];
    },
    async execute(_args: string[]): Promise<"break" | "continue" | "use"> {
      const { messageHistory, terminal } = options;
      const history = messageHistory.get();

      const lastText = extractLastAssistantText(history);
      if (!lastText) {
        terminal.info("No assistant response to copy.");
        return "continue";
      }

      try {
        await Clipboard.setText(lastText);
        terminal.success("Copied last response to clipboard.");
        return "continue";
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        terminal.error(`Could not copy to clipboard: ${message}`);
        return "continue";
      }
    },
    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const { messageHistory } = options;
      const history = messageHistory.get();

      container.addChild(new Spacer(1));

      const lastText = extractLastAssistantText(history);
      if (!lastText) {
        container.addChild(
          new Text(style.dim("No assistant response to copy."), 1, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      try {
        await Clipboard.setText(lastText);
        container.addChild(
          new Text(style.dim("Copied last response to clipboard."), 1, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        container.addChild(
          new Text(style.dim(`Could not copy to clipboard: ${message}`), 1, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
}
