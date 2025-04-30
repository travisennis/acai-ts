/**
 * Terminal Formatting Utilities
 *
 * Provides functions for formatting and displaying text in the terminal.
 */

import chalk from "chalk";
import { Marked } from "marked";
import { TerminalRenderer } from "./marked-renderer.ts";

const marked = new Marked().setOptions({
  // Define custom renderer
  renderer: new TerminalRenderer({
    strong: chalk.blue.bold,
    tab: 2,
  }),
});

const wrapMarked = new Marked().setOptions({
  // Define custom renderer
  renderer: new TerminalRenderer({
    strong: chalk.blue.bold,
    tab: 2,
    width: Math.max(80, process.stdout.columns - 6),
    reflowText: true,
  }),
});

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
 * Format output for display in the terminal
 */
export async function formatOutput(
  text: string,
  wrap = false,
): Promise<string> {
  if (!text) {
    return "";
  }

  const formattedText = wrap
    ? await wrapMarked.parse(text)
    : await marked.parse(text);

  return formattedText.trimEnd();
}

/**
 * Word wrap text to the specified width
 */
export function wordWrap(text: string, width: number): string {
  const lines = text.split("\n");

  return lines
    .map((line) => {
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
    })
    .join("\n");
}
