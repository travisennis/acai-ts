/**
 * Terminal Interface Module
 *
 * Provides a user interface for interacting with Claude Code in the terminal.
 * Handles input/output, formatting, and display.
 */

import Table from "cli-table3";
import { logger } from "../logger.ts";
import { getPackageVersion } from "../version.ts";
import {
  clearTerminal,
  getTerminalSize,
  setTerminalTitle,
  link as terminalLink,
} from "./formatting.ts";
import { applyMarkdown } from "./markdown.ts";
import stripAnsi from "./strip-ansi.ts";
import style, { type StyleInstance } from "./style.ts";
import type { TerminalConfig } from "./types.ts";
import wrapAnsi from "./wrap-ansi.ts";

export function getShell() {
  return process.env["ZSH_VERSION"] ? "zsh" : process.env["SHELL"] || "bash";
}

export function hr(width: number) {
  return `${style.gray("─").repeat(width)} `;
}

export function table(
  data: (string | number)[][],
  options: { header?: string[]; colWidths?: number[]; width: number },
): string {
  const { header, colWidths, width } = options;

  // Determine number of columns from data or header
  let colCount = header?.length;
  if (colCount === undefined) {
    colCount = data.length > 0 && data[0] ? data[0].length : 1;
  }

  // Calculate column widths based on terminal width
  const padding = 5; // Account for table borders and padding
  const availableWidth = Math.max(20, width - padding);

  let computedColWidths: number[];

  if (colWidths && colWidths.length === colCount) {
    // Use provided percentages
    computedColWidths = colWidths.map((percent) =>
      Math.max(10, Math.floor((percent / 100) * availableWidth)),
    );
  } else {
    // Distribute width evenly with minimum width per column
    const minColWidth = 15;
    const maxColsThatFit = Math.floor(availableWidth / minColWidth);
    const actualColCount = Math.min(colCount, maxColsThatFit);

    if (actualColCount === 1) {
      computedColWidths = [availableWidth];
    } else {
      // Calculate base width and distribute remaining pixels
      const baseWidth = Math.floor(availableWidth / actualColCount);
      const remainder = availableWidth % actualColCount;
      computedColWidths = Array(actualColCount).fill(baseWidth);

      // Distribute remainder pixels to first few columns
      for (let i = 0; i < remainder && i < actualColCount; i++) {
        computedColWidths[i] = (computedColWidths[i] || 0) + 1;
      }
    }

    // If we have fewer computed widths than columns, extend the array
    while (computedColWidths.length < colCount) {
      computedColWidths.push(minColWidth);
    }
  }

  const table = new Table({
    head: header,
    colWidths: computedColWidths,
    wordWrap: true,
    wrapOnWordBoundary: true,
  });

  // Ensure all data rows have the same number of columns
  const normalizedData = data.map((row) => {
    if (row.length < colCount) {
      // Pad with empty strings if row has fewer columns
      return [...row, ...Array(colCount - row.length).fill("")];
    }
    if (row.length > colCount) {
      // Truncate if row has more columns
      return row.slice(0, colCount);
    }
    return row;
  });

  table.push(...normalizedData);

  return table.toString();
}

export function displayProgressBar(
  current: number,
  total: number,
  width: number,
) {
  const terminalWidth = width;

  // Function to format numbers concisely (e.g., 1.2K, 5M)
  const formatNumber = (num: number): string => {
    if (num < 1000) {
      return num.toString();
    }
    if (num < 1_000_000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    if (num < 1_000_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`;
    }
    return `${(num / 1_000_000_000).toFixed(1)}G`;
  };

  const currentFormatted = formatNumber(current);
  const totalFormatted = formatNumber(total);
  const progressText = `${currentFormatted}/${totalFormatted}`;
  const progressTextLength = progressText.length + 1; // Add 1 for space

  const progressBarMaxWidth = Math.max(1, terminalWidth - progressTextLength);

  const percentage = total === 0 ? 1 : current / total;
  const filledWidth = Math.max(
    0,
    Math.min(progressBarMaxWidth, Math.floor(percentage * progressBarMaxWidth)),
  );
  const emptyWidth = Math.max(0, progressBarMaxWidth - filledWidth);

  const a =
    filledWidth / progressBarMaxWidth > 0.5
      ? style.red("─")
      : style.yellow("─"); //"█"
  const b = style.gray("─"); // "░"
  const filledBar = a.repeat(filledWidth);
  const emptyBar = b.repeat(emptyWidth);

  // Use \r to move cursor to the beginning of the line for updates
  return `\r${filledBar}${emptyBar} ${progressText}  `;
}

/**
 * Initialize the terminal interface
 */
export function initTerminal(config: Partial<TerminalConfig> = {}): Terminal {
  logger.debug("Initializing terminal interface");

  const terminalConfig: TerminalConfig = {
    theme: config.theme || "system",
    useColors: config.useColors !== false,
    showProgressIndicators: config.showProgressIndicators !== false,
    codeHighlighting: config.codeHighlighting !== false,
    maxHeight: config.maxHeight,
    maxWidth: config.maxWidth,
  };

  const terminal = new Terminal(terminalConfig);

  try {
    // Detect terminal capabilities
    terminal.detectCapabilities();

    return terminal;
  } catch (error) {
    logger.warn(error, "Error initializing terminal interface:");

    // Return a basic terminal interface even if there was an error
    return terminal;
  }
}

/**
 * Terminal class for handling user interaction
 */
export class Terminal {
  private config: TerminalConfig;
  private terminalWidth: number;
  private terminalHeight: number;
  private isInteractive: boolean;

  constructor(config: TerminalConfig) {
    this.config = config;

    // Get initial terminal size
    const { rows, columns } = getTerminalSize();
    this.terminalHeight = config.maxHeight || rows;
    this.terminalWidth = config.maxWidth || columns;

    // Assume interactive by default
    this.isInteractive = process.stdout.isTTY && process.stdin.isTTY;

    // Listen for terminal resize events
    process.stdout.on("resize", () => {
      const { rows, columns } = getTerminalSize();
      this.terminalHeight = config.maxHeight || rows;
      this.terminalWidth = config.maxWidth || columns;
      logger.debug(`Terminal resized to ${columns}x${rows}`);
    });
  }

  /**
   * Detect terminal capabilities
   */
  detectCapabilities() {
    // Check if the terminal is interactive
    this.isInteractive = Boolean(process.stdout.isTTY && process.stdin.isTTY);

    logger.debug(
      {
        isInteractive: this.isInteractive,
        colorSupport: this.config.useColors ? "yes" : "no",
        size: `${this.terminalWidth}x${this.terminalHeight}`,
      },
      "Terminal capabilities detected",
    );
  }

  setTitle(title: string) {
    setTerminalTitle(title);
  }

  getLogo(): string {
    return `
   █████╗  ██████╗ █████╗ ██╗
  ██╔══██╗██╔════╝██╔══██╗██║
  ███████║██║     ███████║██║
  ██╔══██║██║     ██╔══██║██║
  ██║  ██║╚██████╗██║  ██║██║
  ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝
                                       `;
  }

  /**
   * Display the welcome message
   */
  displayWelcome(): void {
    this.clear();

    const version = getPackageVersion();

    this.writeln(style.magenta(this.getLogo()));
    this.lineBreak();
    this.writeln(style.magenta("Greetings! I am acai."));
    this.writeln(style.gray(`  Version ${version}`));
    this.lineBreak();

    this.writeln(
      style.white(`  Type ${style.cyan("/help")} to see available commands.`),
    );
    this.writeln(
      style.white(
        "  You can ask acai to explain code, fix issues, or perform tasks.",
      ),
    );
    this.writeln(
      style.white(
        `  Example: "${style.italic("Please analyze this codebase and explain its structure.")}"`,
      ),
    );
    this.writeln(style.dim("  Use Ctrl+C to interrupt acai and exit."));

    this.lineBreak();

    this.writeln(
      style.yellow(`The current working directory is ${process.cwd()}`),
    );

    this.lineBreak();
  }

  /**
   * Clear the terminal screen
   */
  clear(): void {
    if (this.isInteractive) {
      clearTerminal();
    }
  }

  /**
   * Start progress indicator in terminal
   * Sends terminal escape sequence to show progress animation
   */
  startProgress(): void {
    process.stdout.write("\u001b]9;4;3;0\u0007");
  }

  /**
   * Stop progress indicator in terminal
   * Sends terminal escape sequence to hide progress animation
   */
  stopProgress(): void {
    process.stdout.write("\u001b]9;4;0;0\u0007");
  }

  /**
   * Display formatted content
   */
  display(content: string, wrap = false): void {
    this.writeln(this.formatMarkdown(content, wrap));
  }

  /**
   * Display a message with emphasis
   */
  emphasize(message: string): void {
    if (this.config.useColors) {
      this.writeln(style.cyan.bold(message));
    } else {
      this.writeln(message.toUpperCase());
    }
  }

  /**
   * Display an informational message
   */
  info(message: string): void {
    if (this.config.useColors) {
      this.writeln(style.blue(`ℹ ${message}`));
    } else {
      this.writeln(`INFO: ${message}`);
    }
  }

  /**
   * Display a success message
   */
  success(message: string): void {
    if (this.config.useColors) {
      this.writeln(style.green(`✓ ${message}`));
    } else {
      this.writeln(`SUCCESS: ${message}`);
    }
  }

  /**
   * Display a warning message
   */
  warn(message: string): void {
    if (this.config.useColors) {
      this.writeln(style.yellow(`⚠ ${message}`));
    } else {
      this.writeln(`WARNING: ${message}`);
    }
  }

  /**
   * Display an error message
   */
  error(message: string): void {
    if (this.config.useColors) {
      this.writeln(style.red(`✗ ${message}`));
    } else {
      this.writeln(`ERROR: ${message}`);
    }
  }

  /**
   * Emits an alert.
   */
  alert(): void {
    if (!this.isInteractive) {
      return;
    }

    const t = "acai";
    const b = "";
    try {
      process.stdout.write("\x07");
      const esc = "\u001b";
      const bel = "\u0007";
      const safe = (s: string) =>
        s.replaceAll("\u0007", "").replaceAll("\u001b", "");
      const payload = `${esc}]777;notify;${safe(t)};${safe(b)}${bel}`;
      process.stdout.write(payload);
    } catch (err) {
      logger.warn({ err }, "Failed to emit alert");
    }
  }

  write(input: string): void {
    process.stdout.write(input);
  }

  writeln(input: string): void {
    process.stdout.write(`${input}\n`);
  }

  lineBreak() {
    this.writeln("");
  }

  header(header: string, styleFn: StyleInstance = style.cyan): void {
    const cols = this.terminalWidth > 0 ? this.terminalWidth : 80;
    const width = Math.max(0, cols - header.length - 4);
    this.writeln(
      `${style.gray("\n── ")}${styleFn(header)} ${style.gray("─".repeat(width))}`,
    );
  }

  async box(header: string, content: string): Promise<void> {
    const cols = this.terminalWidth > 0 ? this.terminalWidth : 80;
    const width = Math.max(4, cols - 4);

    // Helper to strip ANSI sequences for accurate visible-width calculation

    const paddedHeader = ` ${header} `;
    const headerVisibleLen = stripAnsi(paddedHeader).length;
    const headerStartPos = 1;

    // Top border with header (use visible header length)
    const leftDashes = headerStartPos;
    const rightDashes = Math.max(0, width - leftDashes - headerVisibleLen);
    const topBorder = `┌${"─".repeat(leftDashes)}${paddedHeader}${"─".repeat(rightDashes)}┐`;

    // Prepare inner content: format markdown first, then wrap to inner width
    const innerWidth = Math.max(1, width - 2);
    const formatted = applyMarkdown(content);
    const wrapped = wrapAnsi(formatted, innerWidth, { trim: false });

    const contentLines = wrapped
      .split("\n")
      .map((line) => {
        const visibleLen = stripAnsi(line).length;
        const padCount = Math.max(0, innerWidth - visibleLen);
        return `│ ${line}${" ".repeat(padCount)} │`;
      })
      .join("\n");

    // Bottom border
    const bottomBorder = `└${"─".repeat(width)}┘`;

    // Write the box
    this.writeln(`${topBorder}\n${contentLines}\n${bottomBorder}`);
  }

  hr(styleFn: StyleInstance = style.gray): void {
    const cols = this.terminalWidth > 0 ? this.terminalWidth : 80;
    this.writeln(styleFn(`${"─".repeat(Math.max(1, cols - 1))} `));
  }

  /**
   * Create a clickable link in the terminal if supported
   */
  link(text: string, url: string): string {
    return style.underline.blue(terminalLink(text, url));
  }

  /**
   * Display a table of data
   */
  table(
    data: (string | number)[][],
    options: { header?: string[]; colWidths?: number[] } = {},
  ): void {
    const { header, colWidths } = options;

    // Determine number of columns from data or header
    let colCount = header?.length;
    if (colCount === undefined) {
      colCount = data.length > 0 && data[0] ? data[0].length : 1;
    }

    // Calculate column widths based on terminal width
    const padding = 5; // Account for table borders and padding
    const availableWidth = Math.max(20, this.terminalWidth - padding);

    let computedColWidths: number[];

    if (colWidths && colWidths.length === colCount) {
      // Use provided percentages
      computedColWidths = colWidths.map((percent) =>
        Math.max(10, Math.floor((percent / 100) * availableWidth)),
      );
    } else {
      // Distribute width evenly with minimum width per column
      const minColWidth = 15;
      const maxColsThatFit = Math.floor(availableWidth / minColWidth);
      const actualColCount = Math.min(colCount, maxColsThatFit);

      if (actualColCount === 1) {
        computedColWidths = [availableWidth];
      } else {
        // Calculate base width and distribute remaining pixels
        const baseWidth = Math.floor(availableWidth / actualColCount);
        const remainder = availableWidth % actualColCount;
        computedColWidths = Array(actualColCount).fill(baseWidth);

        // Distribute remainder pixels to first few columns
        for (let i = 0; i < remainder && i < actualColCount; i++) {
          computedColWidths[i] = (computedColWidths[i] || 0) + 1;
        }
      }

      // If we have fewer computed widths than columns, extend the array
      while (computedColWidths.length < colCount) {
        computedColWidths.push(minColWidth);
      }
    }

    const table = new Table({
      head: header,
      colWidths: computedColWidths,
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    // Ensure all data rows have the same number of columns
    const normalizedData = data.map((row) => {
      if (row.length < colCount) {
        // Pad with empty strings if row has fewer columns
        return [...row, ...Array(colCount - row.length).fill("")];
      }
      if (row.length > colCount) {
        // Truncate if row has more columns
        return row.slice(0, colCount);
      }
      return row;
    });

    table.push(...normalizedData);

    this.writeln(table.toString());
  }

  /**
   * Displays a horizontal progress bar in the console.
   * @param current The current value.
   * @param total The target value.
   */
  displayProgressBar(current: number, total: number): void {
    const terminalWidth = this.terminalWidth > 0 ? this.terminalWidth : 80; // Default to 80 if columns not available

    // Function to format numbers concisely (e.g., 1.2K, 5M)
    const formatNumber = (num: number): string => {
      if (num < 1000) {
        return num.toString();
      }
      if (num < 1_000_000) {
        return `${(num / 1000).toFixed(1)}K`;
      }
      if (num < 1_000_000_000) {
        return `${(num / 1_000_000).toFixed(1)}M`;
      }
      return `${(num / 1_000_000_000).toFixed(1)}G`;
    };

    const currentFormatted = formatNumber(current);
    const totalFormatted = formatNumber(total);
    const progressText = `${currentFormatted}/${totalFormatted}`;
    const progressTextLength = progressText.length + 1; // Add 1 for space

    const progressBarMaxWidth = Math.max(
      1,
      terminalWidth - progressTextLength - 1,
    );

    const percentage = total === 0 ? 1 : current / total;
    const filledWidth = Math.max(
      0,
      Math.min(
        progressBarMaxWidth,
        Math.floor(percentage * progressBarMaxWidth),
      ),
    );
    const emptyWidth = Math.max(0, progressBarMaxWidth - filledWidth);

    const a =
      filledWidth / progressBarMaxWidth > 0.5
        ? style.red("─")
        : style.yellow("─"); //"█"
    const b = style.gray("─"); // "░"
    const filledBar = a.repeat(filledWidth);
    const emptyBar = b.repeat(emptyWidth);

    // Use \r to move cursor to the beginning of the line for updates
    this.writeln(`\r${filledBar}${emptyBar} ${progressText}  `);
  }

  private formatMarkdown(content: string, wrap = false): string {
    const columns = this.terminalWidth;
    const formatted = applyMarkdown(content);

    if (wrap) {
      return wrapAnsi(formatted, columns - 6, { trim: false });
    }
    return formatted;
  }
}

// Re-export the types
export * from "./types.ts";
