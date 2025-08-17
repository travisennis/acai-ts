/**
 * Terminal Interface Module
 *
 * Provides a user interface for interacting with Claude Code in the terminal.
 * Handles input/output, formatting, and display.
 */

import chalk, { type ChalkInstance } from "chalk";
import Table from "cli-table3";
import ora from "ora";
import wrapAnsi from "wrap-ansi";
import { logger } from "../logger.ts";
import { getPackageVersion } from "../version.ts";
import {
  clearTerminal,
  getTerminalSize,
  setTerminalTitle,
  stripAnsi,
  link as terminalLink,
} from "./formatting.ts";
import { applyMarkdown } from "./markdown.ts";
import type { SpinnerInstance, TerminalConfig } from "./types.ts";

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
  private activeSpinners: Map<string, SpinnerInstance> = new Map();
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

    this.writeln(chalk.magenta(this.getLogo()));
    this.lineBreak();
    this.writeln(chalk.magenta("Greetings! I am acai."));
    this.writeln(chalk.gray(`  Version ${version}`));
    this.lineBreak();

    this.writeln(
      chalk.white(`  Type ${chalk.cyan("/help")} to see available commands.`),
    );
    this.writeln(
      chalk.white(
        "  You can ask acai to explain code, fix issues, or perform tasks.",
      ),
    );
    this.writeln(
      chalk.white(
        `  Example: "${chalk.italic("Please analyze this codebase and explain its structure.")}"`,
      ),
    );
    this.writeln(chalk.dim("  Use Ctrl+C to interrupt acai and exit."));

    this.lineBreak();

    this.writeln(
      chalk.yellow(`The current working directory is ${process.cwd()}`),
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
      this.writeln(chalk.cyan.bold(message));
    } else {
      this.writeln(message.toUpperCase());
    }
  }

  /**
   * Display an informational message
   */
  info(message: string): void {
    if (this.config.useColors) {
      this.writeln(chalk.blue(`ℹ ${message}`));
    } else {
      this.writeln(`INFO: ${message}`);
    }
  }

  /**
   * Display a success message
   */
  success(message: string): void {
    if (this.config.useColors) {
      this.writeln(chalk.green(`✓ ${message}`));
    } else {
      this.writeln(`SUCCESS: ${message}`);
    }
  }

  /**
   * Display a warning message
   */
  warn(message: string): void {
    if (this.config.useColors) {
      this.writeln(chalk.yellow(`⚠ ${message}`));
    } else {
      this.writeln(`WARNING: ${message}`);
    }
  }

  /**
   * Display an error message
   */
  error(message: string): void {
    if (this.config.useColors) {
      this.writeln(chalk.red(`✗ ${message}`));
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

  header(header: string, chalkFn: ChalkInstance = chalk.green): void {
    const cols = this.terminalWidth > 0 ? this.terminalWidth : 80;
    const width = Math.max(0, cols - header.length - 4);
    this.writeln(chalkFn(`\n── ${header} ${"─".repeat(width)}  `));
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

  hr(chalkFn: ChalkInstance = chalk.gray): void {
    const cols = this.terminalWidth > 0 ? this.terminalWidth : 80;
    this.writeln(chalkFn(`${"─".repeat(Math.max(1, cols - 1))} `));
  }

  /**
   * Create a clickable link in the terminal if supported
   */
  link(text: string, url: string): string {
    return chalk.underline.blue(terminalLink(text, url));
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
   * Create a spinner for showing progress
   */
  spinner(text: string, id = "default"): SpinnerInstance {
    // Clean up existing spinner with the same ID
    if (this.activeSpinners.has(id)) {
      this.activeSpinners.get(id)?.stop();
      this.activeSpinners.delete(id);
    }

    // Create spinner only if progress indicators are enabled and terminal is interactive
    if (this.config.showProgressIndicators && this.isInteractive) {
      const spinner = ora({
        text,
        spinner: "dots",
        color: "cyan",
      }).start();

      const spinnerInstance: SpinnerInstance = {
        id,
        update: (newText: string) => {
          spinner.text = newText;
          return spinnerInstance;
        },
        succeed: (text?: string) => {
          spinner.succeed(text);
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        fail: (text?: string) => {
          spinner.fail(text);
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        warn: (text?: string) => {
          spinner.warn(text);
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        info: (text?: string) => {
          spinner.info(text);
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        clear: () => {
          spinner.clear();
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        stop: () => {
          spinner.stop();
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
      };

      this.activeSpinners.set(id, spinnerInstance);
      return spinnerInstance;
    }
    // Fallback for non-interactive terminals or when progress indicators are disabled
    console.info(text);

    // Return a dummy spinner
    const dummySpinner: SpinnerInstance = {
      id,
      update: (newText: string) => {
        if (newText !== text) {
          console.info(newText);
        }
        return dummySpinner;
      },
      succeed: (text?: string) => {
        if (text) {
          this.success(text);
        }
        return dummySpinner;
      },
      fail: (text?: string) => {
        if (text) {
          this.error(text);
        }
        return dummySpinner;
      },
      warn: (text?: string) => {
        if (text) {
          this.warn(text);
        }
        return dummySpinner;
      },
      info: (text?: string) => {
        if (text) {
          this.info(text);
        }
        return dummySpinner;
      },
      clear: () => {
        return dummySpinner;
      },
      stop: () => {
        return dummySpinner;
      },
    };

    return dummySpinner;
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
        ? chalk.red("─")
        : chalk.yellow("─"); //"█"
    const b = chalk.gray("─"); // "░"
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
