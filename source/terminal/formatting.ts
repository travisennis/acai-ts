/**
 * Terminal Formatting Utilities
 *
 * Provides functions for formatting and displaying text in the terminal.
 */
import style from "./style.ts";
import { supportsHyperlinks } from "./supports-hyperlinks.ts";

/**
 * Create a horizontal rule
 */
export function hr(width: number) {
  return `${style.gray("─").repeat(width)}`;
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
  return null;
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

/**
 * Display a message with emphasis
 */
export function emphasize(message: string): string {
  return style.cyan.bold(message);
}

/**
 * Display an informational message
 */
export function info(message: string): string {
  return style.blue(`ℹ ${message}`);
}

/**
 * Display a success message
 */
export function success(message: string): string {
  return style.green(`✓ ${message}`);
}

/**
 * Display a warning message
 */
export function warn(message: string): string {
  return style.yellow(`⚠ ${message}`);
}

/**
 * Display an error message
 */
export function error(message: string): string {
  return style.red(`✗ ${message}`);
}
