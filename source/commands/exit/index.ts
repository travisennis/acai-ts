import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Text } from "../../tui/index.ts";
import type { ReplCommand } from "../types.ts";
import { clearTmpDirectory } from "./utils.ts";

export interface ExitCommandOptions {
  sessionManager: {
    isEmpty: () => boolean;
    save: () => Promise<void>;
  };
  baseDir?: string | null;
}

export const exitCommand = ({
  sessionManager,
  baseDir,
}: ExitCommandOptions): ReplCommand => {
  return {
    command: "/exit",
    aliases: ["/bye", "/quit"],
    description: "Exits and saves the chat history.",
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
      }

      // Clear the .tmp directory on exit
      await clearTmpDirectory(baseDir);

      container.addChild(new Text("Exiting...", 0, 1));
      tui.requestRender();
      editor.setText("");
      return "break";
    },
  };
};
