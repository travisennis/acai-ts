/**
 * Terminal Formatting Utilities
 *
 * Provides functions for formatting and displaying text in the terminal.
 */
import { supportsHyperlinks } from "./supports-hyperlinks.ts";

/**
 * Clear the terminal screen
 */
export function clearScreen(): void {
  // Clear screen and move cursor to top-left
  process.stdout.write("\x1b[2J\x1b[0f");
}

/**
 * Clear the terminal screen including scrollback buffer
 *
 * Unlike clearScreen, this function:
 * 1. Clears the entire screen (\x1b[2J)
 * 2. Clears the scrollback buffer (\x1b[3J)
 * 3. Moves cursor to home position (\x1b[H)
 * 4. Returns a Promise that resolves when the write operation completes
 *
 * @returns Promise that resolves when the terminal has been cleared
 */
export function clearTerminal(): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H", () => {
      resolve();
    });
  });
}

/**
 * Sets the terminal title
 */
export function setTerminalTitle(title: string): void {
  if (process.platform === "win32") {
    process.title = title ? `✳✳ ${title}` : title;
  } else {
    process.stdout.write(`\x1b]0;${title ? `✳✳ ${title}` : ""}\x07`);
  }
}

/**
 * Get the terminal size (rows and columns)
 */
export function getTerminalSize(): { rows: number; columns: number } {
  // Default to a reasonable size if we can't determine the actual size
  const defaultSize = { rows: 24, columns: 80 };

  try {
    if (process.stdout.isTTY) {
      return {
        rows: process.stdout.rows || defaultSize.rows,
        columns: process.stdout.columns || defaultSize.columns,
      };
    }
  } catch (_error) {
    // Ignore errors
  }

  return defaultSize;
}

/**
 * Word wrap text to the specified width
 */
export function wordWrap(text: string, width: number): string {
  const lines = text.split("\n");

  return lines.map((line) => wrapLine(line, width)).join("\n");
}

function wrapLine(line: string, width: number): string {
  // If the line is a code block or already shorter than the width, leave it as is
  if (line.trim().startsWith("┃") || line.length <= width) {
    return line;
  }

  // Word wrap the line
  const words = line.split(" ");
  const wrappedLines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    // If adding this word would exceed the width
    if (currentLine.length + word.length + 1 > width) {
      // Add the current line to wrapped lines if it's not empty
      if (currentLine) {
        wrappedLines.push(currentLine);
        currentLine = word;
      } else {
        // If the current line is empty, it means the word itself is longer than the width
        wrappedLines.push(word);
      }
    } else {
      // Add the word to the current line
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }

  // Add the last line if it's not empty
  if (currentLine) {
    wrappedLines.push(currentLine);
  }

  return wrappedLines.join("\n");
}

// const ESC = "\u001B[";
const OSC = "\u001B]";
const BEL = "\u0007";
const SEP = ";";

export const link = (text: string, url: string) => {
  if (supportsHyperlinks.stdout) {
    return [OSC, "8", SEP, SEP, url, BEL, text, OSC, "8", SEP, SEP, BEL].join(
      "",
    );
  }
  return `[${text}](${url})`;
};

export const image = (
  data: string | Buffer,
  options: {
    width?: number | string;
    height?: number | string;
    preserveAspectRatio?: boolean;
  } = {},
) => {
  let returnValue = `${OSC}1337;File=inline=1`;

  if (options.width) {
    returnValue += `;width=${options.width}`;
  }

  if (options.height) {
    returnValue += `;height=${options.height}`;
  }

  if (options.preserveAspectRatio === false) {
    returnValue += ";preserveAspectRatio=0";
  }

  return `${returnValue}:${Buffer.from(data).toString("base64")}${BEL}`;
};
