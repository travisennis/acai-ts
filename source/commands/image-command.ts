import Clipboard from "@crosscopy/clipboard";
import { logger } from "../logger.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

const base64UrlRegex = /^data:(.*?);base64,/;
export const imageCommand = ({
  terminal,
  promptManager,
}: CommandOptions): ReplCommand => {
  return {
    command: "/image",
    description: "Pastes an image from the clipboard into the next prompt.",
    result: "continue" as const,
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      try {
        if (Clipboard.hasImage()) {
          const base64DataUrl = await Clipboard.getImageBase64();

          // Extract MIME type from data URL
          const mimeTypeMatch = base64DataUrl.match(base64UrlRegex);
          const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";

          promptManager.addContext({
            type: "image",
            image: base64DataUrl,
            mimeType,
          });

          terminal.success(
            "Image from clipboard will be added to your next prompt.",
          );
        } else {
          terminal.warn("No image found in clipboard.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        terminal.error(`Error processing clipboard image: ${message}`);
        // Log the full error for debugging if needed, but keep terminal output concise
        logger.error(error, "Image command error:", error);
        console.error(error);
      }
    },
  };
};
