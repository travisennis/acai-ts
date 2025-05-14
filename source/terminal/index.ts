/**
 * Terminal Interface Module
 *
 * Provides a user interface for interacting with Claude Code in the terminal.
 * Handles input/output, formatting, and display.
 */

import { readFileSync } from "node:fs";
import { join } from "@travisennis/stdlib/desm";
import chalk, { type ChalkInstance } from "chalk";
import Table from "cli-table3";
import notifier from "node-notifier";
import ora from "ora";
import terminalLink from "terminal-link";
import wrapAnsi from "wrap-ansi";
import { logger } from "../logger.ts";
import {
  clearTerminal,
  getTerminalSize,
  setTerminalTitle,
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
    logger.warn("Error initializing terminal interface:", error);

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
    this.isInteractive = process.stdout.isTTY && process.stdin.isTTY;

    // Check color support
    if (this.config.useColors && !chalk.level) {
      logger.warn("Terminal does not support colors, disabling color output");
      this.config.useColors = false;
    }

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

    const packageJson = JSON.parse(
      readFileSync(join(import.meta.url, "..", "..", "package.json"), "utf8"),
    );
    const version = packageJson.version;

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
    const formatted = applyMarkdown(content);

    if (wrap) {
      this.writeln(
        wrapAnsi(formatted, this.terminalWidth - 6, { trim: false }),
      );
      return;
    }
    this.writeln(formatted);
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
   * Emits an audible alert sound in the terminal using system notifications.
   */
  alert(): void {
    // Only emit alert in interactive terminals to avoid issues in CI/scripts
    if (this.isInteractive) {
      notifier.notify({
        title: "Acai Alert",
        message: `The current task has finished in ${process.cwd()}`,
        sound: true,
        wait: false,
      });
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
    const width = process.stdout.columns - header.length - 4; // Adjusted for extra spaces
    this.writeln(
      chalkFn(`── ${header} ${"─".repeat(width > 0 ? width : 0)}  `),
    );
  }

  async box(header: string, content: string): Promise<void> {
    const width = process.stdout.columns - 4; // Account for box borders
    const paddedHeader = ` ${header} `;
    const headerStartPos = 1; //Math.floor((width - paddedHeader.length) / 2);

    // Top border with header
    const topBorder = `┌${"─".repeat(headerStartPos)}${paddedHeader}${"─".repeat(width - headerStartPos - paddedHeader.length)}┐`;

    // Content lines with side borders
    const contentLines = content
      .split("\n")
      .map((line) => {
        return `│ ${line.padEnd(width - 2)} │`;
      })
      .join("\n");

    // Bottom border
    const bottomBorder = `└${"─".repeat(width)}┘`;

    // Write the box
    process.stdout.write(
      `${topBorder}\n${this.display(contentLines, true)}${bottomBorder}\n`,
    );
  }

  hr(chalkFn: ChalkInstance = chalk.gray): void {
    this.writeln(chalkFn(`${"─".repeat(process.stdout.columns - 1)} `));
  }

  /**
   * Create a clickable link in the terminal if supported
   */
  link(text: string, url: string): string {
    return terminalLink(text, url, {
      fallback: (text, url) => `${text} (${url})`,
    });
  }

  /**
   * Display a table of data
   */
  table(
    data: [string, string | number][],
    options: { header?: string[] } = {},
  ): void {
    // Calculate column widths based on terminal width
    const padding = 5; // Account for table borders and padding
    const availableWidth = this.terminalWidth - padding;
    const commandWidth = Math.max(10, Math.floor(availableWidth * 0.3)); // Ensure minimum width
    const descriptionWidth = Math.max(15, Math.floor(availableWidth * 0.7)); // Ensure minimum width

    const table = new Table({
      head: options.header,
      colWidths: [commandWidth, descriptionWidth],
      wordWrap: true, // Enable word wrapping for the description column
    });

    table.push(...data);

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
    const terminalWidth = process.stdout.columns || 80; // Default to 80 if columns not available

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

    const progressBarMaxWidth = terminalWidth - progressTextLength - 1;

    const percentage = total === 0 ? 1 : current / total;
    const filledWidth = Math.max(
      0,
      Math.min(
        progressBarMaxWidth,
        Math.floor(percentage * progressBarMaxWidth),
      ),
    );
    const emptyWidth = Math.max(0, progressBarMaxWidth - filledWidth);

    const a = chalk.yellow("─"); //"█"
    const b = chalk.gray("─"); // "░"
    const filledBar = a.repeat(filledWidth);
    const emptyBar = b.repeat(emptyWidth);

    // Use \r to move cursor to the beginning of the line for updates
    this.writeln(`\r${filledBar}${emptyBar} ${progressText}  `);
  }
}

// Re-export the types
// biome-ignore lint/performance/noReExportAll: <explanation>
// biome-ignore lint/performance/noBarrelFile: <explanation>
export * from "./types.ts";
