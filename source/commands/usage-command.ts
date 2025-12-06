import type { Container, Editor, TUI } from "../tui/index.ts";
import {
  Modal,
  Container as ModalContainer,
  ModalText,
  TableComponent,
} from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function usageCommand({ tokenTracker }: CommandOptions): ReplCommand {
  return {
    command: "/usage",
    description: "Show token usage breakdown",

    getSubCommands: () => Promise.resolve([]),
    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const entries = Object.entries(tokenTracker.getUsageBreakdown());

      // Build modal content
      const modalContent = new ModalContainer();

      if (entries.length === 0) {
        modalContent.addChild(new ModalText("No usage yet.", 0, 1));
      } else {
        // Convert entries to table format
        const tableData = entries.map(([app, tokens]) => [app, String(tokens)]);
        modalContent.addChild(
          new TableComponent(tableData, {
            headers: ["App", "Tokens"],
          }),
        );
      }

      // Create and show modal
      const modal = new Modal("Token Usage", modalContent, true, () => {
        // Modal closed callback
        editor.setText("");
        tui.requestRender();
      });

      tui.showModal(modal);
      return "continue";
    },
  };
}
