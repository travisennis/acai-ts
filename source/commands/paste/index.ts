import Clipboard from "@crosscopy/clipboard";
import { formatBlock } from "../../formatting.ts";
import { logger } from "../../logger.ts";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import {
  detectImageFormatFromBase64,
  extractMimeTypeFromDataUrl,
  isValidBase64,
} from "./utils";

export const pasteCommand = ({
  modelManager,
  promptManager,
  tokenCounter,
}: CommandOptions): ReplCommand => {
  return {
    command: "/paste",
    description:
      "Pastes image or text content from the clipboard into the next prompt.",

    getSubCommands: () => Promise.resolve([]),
    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      try {
        if (Clipboard.hasImage()) {
          const base64DataUrl = await Clipboard.getImageBase64();

          if (!isValidBase64(base64DataUrl)) {
            container.addChild(
              new Text(
                style.red(
                  "Invalid base64 data in clipboard. The image data may be corrupted.",
                ),
                1,
                0,
              ),
            );
            tui.requestRender();
            editor.setText("");
            return "continue";
          }

          let mimeType: string;
          try {
            const dataUrlMimeType = extractMimeTypeFromDataUrl(base64DataUrl);
            const base64Content = base64DataUrl.replace(
              /^data:.*?;base64,/,
              "",
            );
            const detectedFormat = detectImageFormatFromBase64(base64Content);

            if (detectedFormat !== "unknown") {
              mimeType = detectedFormat;

              if (dataUrlMimeType !== detectedFormat) {
                logger.warn(
                  `Clipboard library reported ${dataUrlMimeType} but actual image format is ${detectedFormat}. Using detected format.`,
                );
              }
            } else {
              mimeType = dataUrlMimeType;
              logger.warn(
                `Could not detect image format, using data URL MIME type: ${mimeType}`,
              );
            }
          } catch (error) {
            logger.warn(
              `Failed to extract MIME type from clipboard image: ${error}`,
            );
            mimeType = "image/png";
          }

          if (!base64DataUrl.startsWith(`data:${mimeType};base64,`)) {
            const base64Content = base64DataUrl.replace(
              /^data:.*?;base64,/,
              "",
            );
            const correctedDataUrl = `data:${mimeType};base64,${base64Content}`;

            if (!isValidBase64(correctedDataUrl)) {
              container.addChild(
                new Text(
                  style.red(
                    "Failed to correct base64 data format. The image data may be corrupted.",
                  ),
                  1,
                  0,
                ),
              );
              tui.requestRender();
              editor.setText("");
              return "continue";
            }

            promptManager.addContext({
              type: "image",
              image: correctedDataUrl,
              mediaType: mimeType,
            });
          } else {
            promptManager.addContext({
              type: "image",
              image: base64DataUrl,
              mediaType: mimeType,
            });
          }

          container.addChild(
            new Text(
              style.green(
                "Image from clipboard will be added to your next prompt.",
              ),
              1,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        const clipboardContent = await Clipboard.getText();
        if (!clipboardContent || clipboardContent.trim() === "") {
          container.addChild(
            new Text(style.yellow("Clipboard is empty."), 0, 1),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        const content = formatBlock(
          clipboardContent,
          "clipboard",
          modelManager.getModelMetadata("repl").promptFormat,
        );

        promptManager.addContext(content);

        const tokenCount = tokenCounter.count(content);

        container.addChild(
          new Text(
            style.green(
              `Clipboard content will be added to your next prompt. (${tokenCount} tokens)`,
            ),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        container.addChild(
          new Text(
            style.red(`Error processing clipboard content: ${message}`),
            1,
            0,
          ),
        );
        logger.error(error, "Paste command error:");
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};
