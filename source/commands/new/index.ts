import { setTerminalTitle } from "../../terminal/control.ts";
import type { FooterComponent } from "../../tui/components/footer.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";

export const newCommand = ({
  modelManager,
  sessionManager,
  tokenTracker,
}: CommandOptions): ReplCommand => {
  return {
    command: "/new",
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
      if (!sessionManager.isEmpty()) {
        await sessionManager.save();
        sessionManager.create(modelManager.getModel("repl").modelId);
      }

      tokenTracker.reset();

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
