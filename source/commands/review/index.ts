import type { Container, Editor, TUI } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import { showReviewPanel } from "./review-panel.ts";

export const reviewCommand = (_options: CommandOptions): ReplCommand => {
  return {
    command: "/review",
    description: "Shows a diff of all changes in the current directory.",
    getSubCommands: () => Promise.resolve([]),
    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
        inputContainer,
      }: {
        tui: TUI;
        container: Container;
        editor: Editor;
        inputContainer: Container;
      },
    ): Promise<"break" | "continue" | "use"> {
      await showReviewPanel(tui, container, inputContainer, editor);
      return "continue";
    },
  };
};
