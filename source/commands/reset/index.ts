import { setTerminalTitle } from "../../terminal/control.ts";
import type { FooterComponent } from "../../tui/components/footer.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";

export const resetCommand = ({
  modelManager,
  sessionManager: messageHistory,
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

      // Reset footer state to clear usage/cost/steps/tools/time
      const footer = tui.children.find(
        (child): child is FooterComponent =>
          child.constructor.name === "FooterComponent",
      );
      if (footer) {
        footer.resetState();
      }

      tui.requestRender();
      return "continue";
    },
  };
};
