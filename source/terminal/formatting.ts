/**
 * Terminal Formatting Utilities
 *
 * Provides functions for formatting and displaying text in the terminal.
 */

import chalk from "chalk";

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
    process.title = title ? `✳ ${title}` : title;
  } else {
    process.stdout.write(`\x1b]0;${title ? `✳ ${title}` : ""}\x07`);
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
 * Options for formatting output
 */
export interface FormatOptions {
  /**
   * Terminal width in columns
   */
  width?: number;

  /**
   * Whether to use colors
   */
  colors?: boolean;

  /**
   * Whether to highlight code
   */
  codeHighlighting?: boolean;
}

/**
 * Format output for display in the terminal
 */
export function formatOutput(
  text: string,
  options: FormatOptions = {},
): string {
  const {
    width = getTerminalSize().columns,
    colors = true,
    codeHighlighting = true,
  } = options;

  if (!text) {
    return "";
  }

  let formattedText = text;

  // Process markdown-like formatting if colors are enabled
  if (colors) {
    // Format code blocks with syntax highlighting
    formattedText = formatCodeBlocks(text, codeHighlighting);

    // Format inline code
    formattedText = text.replace(/`([^`]+)`/g, (_, code) => chalk.cyan(code));

    // Format bold text
    formattedText = text.replace(/\*\*([^*]+)\*\*/g, (_, bold) =>
      chalk.bold(bold),
    );

    // Format italic text
    formattedText = text.replace(/\*([^*]+)\*/g, (_, italic) =>
      chalk.italic(italic),
    );

    // Format lists
    formattedText = text.replace(
      /^(\s*)-\s+(.+)$/gm,
      (_, indent, item) => `${indent}${chalk.dim("•")} ${item}`,
    );

    // Format headers
    formattedText = text.replace(/^(#+)\s+(.+)$/gm, (_, hashes, header) => {
      if (hashes.length === 1) {
        return chalk.bold.underline.blue(header);
      }
      if (hashes.length === 2) {
        return chalk.bold.blue(header);
      }
      return chalk.bold(header);
    });
  }

  // Word wrap if width is specified
  if (width) {
    formattedText = wordWrap(text, width);
  }

  return formattedText;
}

/**
 * Format code blocks with syntax highlighting
 */
function formatCodeBlocks(text: string, enableHighlighting: boolean): string {
  const codeBlockRegex = /```(\w+)?\n([\s\S]+?)```/g;

  return text.replace(codeBlockRegex, (_match, language, code) => {
    // Add syntax highlighting if enabled
    const highlightedCode: string =
      enableHighlighting && language ? highlightSyntax(code, language) : code;

    // Format the code block with a border
    const lines = highlightedCode.split("\n");
    const border = chalk.dim("┃");

    const formattedLines = lines.map((line) => `${border} ${line}`);
    const top = chalk.dim(
      `┏${"━".repeat(Math.max(...lines.map((l) => l.length)) + 2)}┓`,
    );
    const bottom = chalk.dim(
      `┗${"━".repeat(Math.max(...lines.map((l) => l.length)) + 2)}┛`,
    );

    // Add language indicator if present
    const header = language ? `${border} ${chalk.bold.blue(language)}\n` : "";

    return `${top}\n${header}${formattedLines.join("\n")}\n${bottom}`;
  });
}

/**
 * Simple syntax highlighting for code
 */
function highlightSyntax(code: string, _language: string): string {
  // Basic syntax highlighting - in a real app, use a proper library
  // This is just a simple example with a few patterns

  // Common programming keywords
  const keywords = [
    "function",
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "return",
    "import",
    "export",
    "class",
    "interface",
    "extends",
    "implements",
    "public",
    "private",
    "protected",
    "static",
    "async",
    "await",
  ];

  // Split by tokens that we want to preserve
  const tokens = code.split(/(\s+|[{}[\]();,.<>?:!+\-*/%&|^~=])/);

  return tokens
    .map((token) => {
      // Keywords
      if (keywords.includes(token)) {
        return chalk.blue(token);
      }

      // Numbers
      if (/^[0-9]+(\.[0-9]+)?$/.test(token)) {
        return chalk.yellow(token);
      }

      // Strings
      if (/^["'].*["']$/.test(token)) {
        return chalk.green(token);
      }

      // Comments
      if (
        token.startsWith("//") ||
        token.startsWith("/*") ||
        token.startsWith("*")
      ) {
        return chalk.gray(token);
      }

      return token;
    })
    .join("");
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
