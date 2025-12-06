import type { Container, Editor, TUI } from "../tui/index.ts";
import {
  Modal,
  Container as ModalContainer,
  ModalText,
  TableComponent,
} from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const helpCommand = (
  _options: CommandOptions,
  cmds: Map<string, ReplCommand>,
): ReplCommand => {
  return {
    command: "/help",
    description: "Shows available commands.",
    getSubCommands: () => Promise.resolve([]),
    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const commands = cmds;

      const entries: [string, string][] = Array.from(commands.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, cmd]) => [key, cmd.description]);

      // Build modal content
      const modalContent = new ModalContainer();

      if (entries.length === 0) {
        modalContent.addChild(new ModalText("No commands available.", 0, 1));
      } else {
        // Convert entries to table format
        const tableData = entries.map(([command, description]) => [
          command,
          description,
        ]);
        modalContent.addChild(
          new TableComponent(tableData, {
            headers: ["Command", "Description"],
            colWidths: [30, 70],
          }),
        );
      }

      // Create and show modal
      const modal = new Modal("Available Commands", modalContent, true, () => {
        // Modal closed callback
        editor.setText("");
        tui.requestRender();
      });

      tui.showModal(modal);
      return "continue";
    },
  };
};
