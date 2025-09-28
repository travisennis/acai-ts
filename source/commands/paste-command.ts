import Clipboard from "@crosscopy/clipboard";
import { formatBlock } from "../formatting.ts";
import { logger } from "../logger.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

function extractBase64Content(dataUrl: string): string {
  return dataUrl.replace(/^data:.*?;base64,/, "");
}

function isValidBase64(str: string): boolean {
  try {
    // Remove data URL prefix if present
    const base64Content = extractBase64Content(str);
    // Try to decode the base64 string
    const decoded = Buffer.from(base64Content, "base64");
    // Re-encode to verify it's valid base64
    const reEncoded = decoded.toString("base64");
    // Remove padding for comparison
    const normalizedOriginal = base64Content.replace(/=/g, "");
    const normalizedReEncoded = reEncoded.replace(/=/g, "");
    return normalizedOriginal === normalizedReEncoded;
  } catch {
    return false;
  }
}

function detectImageFormatFromBase64(base64Content: string): string {
  try {
    const buffer = Buffer.from(base64Content, "base64");

    // Check for JPEG signature (FF D8 FF)
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return "image/jpeg";
    }

    // Check for PNG signature (89 50 4E 47 0D 0A 1A 0A)
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return "image/png";
    }

    // Check for GIF signature (GIF87a or GIF89a)
    if (
      buffer.length >= 6 &&
      ((buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38 &&
        buffer[4] === 0x37 &&
        buffer[5] === 0x61) ||
        (buffer[0] === 0x47 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x38 &&
          buffer[4] === 0x39 &&
          buffer[5] === 0x61))
    ) {
      return "image/gif";
    }

    // Check for WebP signature (RIFF .... WEBP)
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "image/webp";
    }

    // Check for BMP signature (BM)
    if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return "image/bmp";
    }

    // Check for TIFF signatures (II* or MM*)
    if (
      buffer.length >= 4 &&
      ((buffer[0] === 0x49 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x2a &&
        buffer[3] === 0x00) ||
        (buffer[0] === 0x4d &&
          buffer[1] === 0x4d &&
          buffer[2] === 0x00 &&
          buffer[3] === 0x2a))
    ) {
      return "image/tiff";
    }

    // If no known signature found, fall back to the data URL MIME type
    return "unknown";
  } catch {
    return "unknown";
  }
}

function extractMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ? match[1] : "image/png";
}

export const pasteCommand = ({
  terminal,
  modelManager,
  promptManager,
  tokenCounter,
}: CommandOptions): ReplCommand => {
  return {
    command: "/paste",
    description:
      "Pastes image or text content from the clipboard into the next prompt.",

    getSubCommands: () => Promise.resolve([]),
    execute: async (): Promise<"break" | "continue" | "use"> => {
      try {
        if (Clipboard.hasImage()) {
          const base64DataUrl = await Clipboard.getImageBase64();

          // Validate the base64 data
          if (!isValidBase64(base64DataUrl)) {
            terminal.error(
              "Invalid base64 data in clipboard. The image data may be corrupted.",
            );
            return "continue";
          }

          // Extract MIME type with better error handling and actual image format detection
          let mimeType: string;
          try {
            // First, try to get MIME type from data URL
            const dataUrlMimeType = extractMimeTypeFromDataUrl(base64DataUrl);

            // Then, detect actual image format from base64 content
            const base64Content = extractBase64Content(base64DataUrl);
            const detectedFormat = detectImageFormatFromBase64(base64Content);

            // Use detected format if available, otherwise fall back to data URL MIME type
            if (detectedFormat !== "unknown") {
              mimeType = detectedFormat;

              // Log if there's a mismatch between data URL and actual format
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

          // Ensure the data URL format is correct
          if (!base64DataUrl.startsWith(`data:${mimeType};base64,`)) {
            // Fix malformed data URLs
            const base64Content = base64DataUrl.replace(
              /^data:.*?;base64,/,
              "",
            );
            const correctedDataUrl = `data:${mimeType};base64,${base64Content}`;

            // Final validation
            if (!isValidBase64(correctedDataUrl)) {
              terminal.error(
                "Failed to correct base64 data format. The image data may be corrupted.",
              );
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

          terminal.success(
            "Image from clipboard will be added to your next prompt.",
          );
          return "continue";
        }

        const clipboardContent = await Clipboard.getText();
        if (!clipboardContent || clipboardContent.trim() === "") {
          terminal.warn("Clipboard is empty.");
          return "continue";
        }

        const content = formatBlock(
          clipboardContent,
          "clipboard",
          modelManager.getModelMetadata("repl").promptFormat,
        );

        promptManager.addContext(content);

        const tokenCount = tokenCounter.count(content);

        terminal.success(
          `Clipboard content will be added to your next prompt. (${tokenCount} tokens)`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        terminal.error(`Error processing clipboard content: ${message}`);
        logger.error(error, "Paste command error:");
        return "continue";
      }
      return "continue";
    },
  };
};
