import Clipboard from "@crosscopy/clipboard";
import clipboardy from "clipboardy";
import { formatBlock } from "../formatting.ts";
import { logger } from "../logger.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

const base64UrlRegex = /^data:(.*?);base64,/;

export const pasteCommand = ({
  terminal,
  modelManager,
  promptManager,
}: CommandOptions): ReplCommand => {
  return {
    command: "/paste",
    description:
      "Pastes image or text content from the clipboard into the next prompt.",
    result: "continue" as const,
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      try {
        if (Clipboard.hasImage()) {
          const base64DataUrl = await Clipboard.getImageBase64();
          const mimeTypeMatch = base64DataUrl.match(base64UrlRegex);
          const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";

          promptManager.addContext({
            type: "image",
            image: base64DataUrl,
            mediaType: mimeType,
          });

          terminal.success(
            "Image from clipboard will be added to your next prompt.",
          );
          return;
        }

        const clipboardContent = await clipboardy.read();
        if (!clipboardContent || clipboardContent.trim() === "") {
          terminal.warn("Clipboard is empty.");
          return;
        }

        promptManager.addContext(
          formatBlock(
            clipboardContent,
            "clipboard",
            modelManager.getModelMetadata("repl").promptFormat,
          ),
        );

        terminal.success(
          "Clipboard content will be added to your next prompt.",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        terminal.error(`Error processing clipboard content: ${message}`);
        logger.error(error, "Paste command error:", error);
      }
    },
  };
};
