import type { Container, Editor, TUI } from "../tui/index.ts";
import { Modal, Container as ModalContainer, ModalText } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const listDirectoriesCommand = ({
  terminal,
  workspace,
}: CommandOptions): ReplCommand => {
  return {
    command: "/list-directories",
    description: "List all allowed working directories",
    getSubCommands: async (): Promise<string[]> => {
      return [];
    },
    execute: async () => {
      terminal.header("Current working directories:");

      workspace.allowedDirs.forEach((dir) => {
        const isPrimary = dir === workspace.primaryDir;
        const prefix = isPrimary ? "● " : "  ";
        const indicator = isPrimary ? " (primary)" : "";
        terminal.writeln(`${prefix}${dir}${indicator}`);
      });

      if (workspace.allowedDirs.length === 0) {
        terminal.warn(
          "No directories configured. Using current directory only.",
        );
      }

      return "continue";
    },
    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      // Build modal content
      const modalContent = new ModalContainer();

      modalContent.addChild(
        new ModalText("Current working directories:", 0, 1),
      );

      if (workspace.allowedDirs.length === 0) {
        modalContent.addChild(
          new ModalText(
            "No directories configured. Using current directory only.",
            0,
            1,
          ),
        );
      } else {
        // Add each directory as a separate line
        workspace.allowedDirs.forEach((dir) => {
          const isPrimary = dir === workspace.primaryDir;
          const prefix = isPrimary ? "● " : "  ";
          const indicator = isPrimary ? " (primary)" : "";
          modalContent.addChild(
            new ModalText(`${prefix}${dir}${indicator}`, 0, 0),
          );
        });
      }

      // Create and show modal
      const modal = new Modal("Working Directories", modalContent, true, () => {
        // Modal closed callback
        editor.setText("");
        tui.requestRender();
      });

      tui.showModal(modal);
      return "continue";
    },
  };
};
