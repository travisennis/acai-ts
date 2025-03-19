import clipboardy from "clipboardy";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const pasteCommand = ({ terminal, fileManager }: CommandOptions) => {
  return {
    command: "/paste",
    description: "Pastes content from the clipboard into the next prompt.",
    result: "continue" as const,
    execute: async () => {
      try {
        const clipboardContent = await clipboardy.read();

        if (!clipboardContent || clipboardContent.trim() === "") {
          terminal.warn("Clipboard is empty.");
          return;
        }

        // Add the clipboard content to the pending content
        const mdQuotes = "```";
        fileManager.addPendingContent(
          `${mdQuotes}\n${clipboardContent}\n${mdQuotes}`,
        );

        terminal.success("Clipboard content will be added to your next prompt");
      } catch (error) {
        terminal.error(
          `Error reading from clipboard: ${(error as Error).message}`,
        );
      }
    },
  } satisfies ReplCommand;
};
